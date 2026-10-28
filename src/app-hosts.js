// Each broadcaster application opens on its own origin,
// http://<label>.<APPS_DOMAIN>:<AOP_PUBLIC_PORT>, with a proxy to the
// bcastEntryPackageUrl of the BALD.
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEFAULT_APPS_DOMAIN = 'apps.localhost';
const DEFAULT_PUBLIC_PORT = 8080;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PROXY_PREFIX = '/graphicsAppProxy';
// Full name of at most 253: label (63) + '.' + domain.
const MAX_DOMAIN = 253 - 64;

// Public port = the one the browser uses (in the compose, the one published
// on the host). *.localhost resolves to the machine of whoever opens the
// page.
function appsConfig(env = process.env) {
    const rawDomain = env.APPS_DOMAIN === undefined ? '' : String(env.APPS_DOMAIN);
    const domain = (rawDomain.trim() || DEFAULT_APPS_DOMAIN).toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!domain || domain.length > MAX_DOMAIN || !domain.split('.').every(l => LABEL_RE.test(l))) {
        throw new Error(`APPS_DOMAIN invalido: '${rawDomain}' (nome DNS: rotulos [a-z0-9-] separados por ponto)`);
    }
    const rawPort = String(env.AOP_PUBLIC_PORT || env.PORT || DEFAULT_PUBLIC_PORT).trim();
    const port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
        throw new Error(`AOP_PUBLIC_PORT invalida: '${rawPort}' (inteiro de 1 a 65535)`);
    }
    return Object.freeze({ domain, port });
}

function shortHash(s) {
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
}

// DNS label of the appId (Table 10: URN that identifies the application):
// accents are removed, the rest outside [a-z0-9] becomes '-'. Above 63
// characters (or empty), it carries a digest of the whole id. urn:a:b and
// urn-a-b give the same label.
function appLabel(id) {
    const raw = id === undefined || id === null ? '' : String(id);
    const label = raw.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!label) return `app-${shortHash(raw)}`;
    if (label.length <= 63) return label;
    return `${label.slice(0, 54).replace(/-+$/, '')}-${shortHash(raw)}`;
}

// Origin as the browser writes it in the Origin header (port 80 omitted).
function appOrigin(label, cfg) {
    return `http://${label}.${cfg.domain}` + (cfg.port === 80 ? '' : `:${cfg.port}`);
}

// Launched application: label, own origin and proxy target. null when the
// target is not an absolute http(s) URL.
function describeApp(appId, target, cfg) {
    let url;
    try {
        url = new URL(target);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const label = appLabel(appId);
    const id = appId === undefined || appId === null ? '' : String(appId);
    return Object.freeze({ appId: id, label, origin: appOrigin(label, cfg), target: String(target) });
}

// URL the graphics layer opens: origin of the application +
// /graphicsAppProxy + bcastEntryPointUrl.
function entryUrl(origin, entryPoint = '') {
    const ep = entryPoint ? String(entryPoint) : '';
    return origin + PROXY_PREFIX + (ep.startsWith('/') ? ep : `/${ep}`);
}

// On the host of the application the prefix is optional (the page asks for
// /js/... from the root); it is removed only as a whole segment
// (/graphicsAppProxyX is not).
function stripPrefix(url) {
    const u = String(url || '/');
    if (u === PROXY_PREFIX) return '/';
    if (u.startsWith(`${PROXY_PREFIX}/`)) return u.slice(PROXY_PREFIX.length);
    if (u.startsWith(`${PROXY_PREFIX}?`)) return `/${u.slice(PROXY_PREFIX.length)}`;
    return u;
}

// Label of the Host header in the domain of the applications; null outside
// it. The prefix comes back as is, even if invalid or with more than one
// label: it matches no application and answers 404.
function hostLabel(host, cfg) {
    if (!host) return null;
    let h = String(host).trim().toLowerCase();
    // IPv6 literal: never an application host.
    if (h.startsWith('[')) return null;
    h = h.replace(/:\d*$/, '').replace(/\.$/, '');
    const suffix = `.${cfg.domain}`;
    if (!h.endsWith(suffix)) return null;
    return h.slice(0, -suffix.length);
}

function proxyError(tag, status, body, log) {
    return (err, req, res) => {
        log.error(`[${tag}] falha no proxy de ${req.headers.host}${req.originalUrl || req.url}: ${err.message}`);
        // Socket (upgrade): there is no HTTP response.
        if (typeof res.status !== 'function') {
            if (typeof res.destroy === 'function') res.destroy();
            return;
        }
        if (res.headersSent) {
            res.end();
            return;
        }
        res.status(status).type('text/plain').send(body);
    };
}

// Routing by Host: an application host never reaches the pages, the static
// files or the express.json of the AoP (the body stays intact).
// lookup(label) returns the running application or null.
function appHostProxy({ cfg, lookup, log = console }) {
    const proxy = createProxyMiddleware({
        target: '',
        changeOrigin: true,
        router: (req) => req.graphicsAppTarget,
        on: {
            proxyReq: (proxyReq, req) => {
                log.log(`[apps] '${req.headers.host}${req.url}' -> '${req.graphicsAppTarget}${proxyReq.path}'`);
            },
            error: proxyError('apps', 502, 'Bad Gateway: aplicacao fora do ar', log),
        },
    });
    return function appHost(req, res, next) {
        const label = hostLabel(req.headers.host, cfg);
        if (label === null) return next();
        const app = lookup(label);
        if (!app) {
            res.status(404).type('text/plain').send(`nenhuma aplicacao em execucao em ${req.headers.host}`);
            return;
        }
        req.graphicsAppTarget = app.target;
        req.url = stripPrefix(req.url);
        return proxy(req, res, next);
    };
}

// /graphicsAppProxy/<path> on the host of the AoP itself (req.url comes
// without the prefix): 302 to the same path on the host of the running
// application; without one, 404. getApp() returns the application
// ({ origin, ... }) or null.
function legacyGraphicsRedirect({ getApp, log = console }) {
    return function legacyRedirect(req, res) {
        const app = getApp();
        if (!app) {
            res.status(404).type('text/plain').send('nenhuma aplicacao em execucao na camada grafica');
            return;
        }
        const to = app.origin + PROXY_PREFIX + (req.url.startsWith('/') ? req.url : `/${req.url}`);
        log.log(`[apps] '${req.headers.host}${req.originalUrl}' -> 302 ${to}`);
        res.redirect(302, to);
    };
}

module.exports = {
    DEFAULT_APPS_DOMAIN,
    DEFAULT_PUBLIC_PORT,
    appsConfig,
    appLabel,
    appOrigin,
    describeApp,
    entryUrl,
    stripPrefix,
    hostLabel,
    appHostProxy,
    legacyGraphicsRedirect,
    PROXY_PREFIX,
};
