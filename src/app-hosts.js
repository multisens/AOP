// Cada aplicacao de emissora abre na propria origem, http://<rotulo>.<APPS_DOMAIN>:<AOP_PUBLIC_PORT>,
// com proxy para o bcastEntryPackageUrl da BALD; borda e tv3ws reconhecem o associado
// pelo Origin. A C.4.1.7 fala em porta de origem atribuida pelo gerenciador e deixa o
// mecanismo de diferenciacao a implementacao: o testbed usa um host por aplicacao.
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEFAULT_APPS_DOMAIN = 'apps.localhost';
const DEFAULT_PUBLIC_PORT = 8080;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PROXY_PREFIX = '/graphicsAppProxy';
// nome completo de no maximo 253: rotulo (63) + '.' + dominio
const MAX_DOMAIN = 253 - 64;

// Porta publica = a que o NAVEGADOR usa (no compose, a publicada no host).
// *.localhost resolve para a maquina de QUEM abre a pagina: com a tela do AoP
// aberta de outra maquina, APPS_DOMAIN precisa de DNS curinga para o AoP.
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

// Rotulo DNS do appId (Tabela 10: URN que identifica a aplicacao): acentos saem,
// o resto fora de [a-z0-9] vira '-'. Acima de 63 caracteres (ou vazio), leva um
// resumo do id inteiro. urn:a:b e urn-a-b caem no mesmo rotulo.
function appLabel(id) {
    const raw = id === undefined || id === null ? '' : String(id);
    const label = raw.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!label) return `app-${shortHash(raw)}`;
    if (label.length <= 63) return label;
    return `${label.slice(0, 54).replace(/-+$/, '')}-${shortHash(raw)}`;
}

// Origem como o navegador a escreve no cabecalho Origin (porta 80 omitida).
function appOrigin(label, cfg) {
    return `http://${label}.${cfg.domain}` + (cfg.port === 80 ? '' : `:${cfg.port}`);
}

// Aplicacao lancada: rotulo, origem propria e alvo do proxy. null quando o
// alvo nao e URL http(s) absoluta (nada a abrir nem a registrar).
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

// URL que a camada grafica abre: origem da aplicacao + /graphicsAppProxy +
// bcastEntryPointUrl.
function entryUrl(origin, entryPoint = '') {
    const ep = entryPoint ? String(entryPoint) : '';
    return origin + PROXY_PREFIX + (ep.startsWith('/') ? ep : `/${ep}`);
}

// No host da aplicacao o prefixo e opcional (a pagina pede /js/... a partir da
// raiz); sai so quando e um segmento inteiro (/graphicsAppProxyX nao e).
function stripPrefix(url) {
    const u = String(url || '/');
    if (u === PROXY_PREFIX) return '/';
    if (u.startsWith(`${PROXY_PREFIX}/`)) return u.slice(PROXY_PREFIX.length);
    if (u.startsWith(`${PROXY_PREFIX}?`)) return `/${u.slice(PROXY_PREFIX.length)}`;
    return u;
}

// Rotulo do cabecalho Host no dominio das aplicacoes; null fora dele (segue
// para o AoP). O prefixo volta como esta, mesmo invalido ou com mais de um
// rotulo: nao casa com nenhuma aplicacao e responde 404.
function hostLabel(host, cfg) {
    if (!host) return null;
    let h = String(host).trim().toLowerCase();
    if (h.startsWith('[')) return null;   // IPv6 literal: nunca e host de aplicacao
    h = h.replace(/:\d*$/, '').replace(/\.$/, '');
    const suffix = `.${cfg.domain}`;
    if (!h.endsWith(suffix)) return null;
    return h.slice(0, -suffix.length);
}

function proxyError(tag, status, body, log) {
    return (err, req, res) => {
        log.error(`[${tag}] falha no proxy de ${req.headers.host}${req.originalUrl || req.url}: ${err.message}`);
        if (typeof res.status !== 'function') {   // socket (upgrade): nao ha resposta HTTP
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

// Roteamento por Host, montado primeiro no server.js: um host de aplicacao nunca
// chega as paginas, aos estaticos nem ao express.json do AoP (o corpo segue
// intacto). lookup(rotulo) devolve a aplicacao em execucao ou null.
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

// /graphicsAppProxy/<caminho> no host do PROPRIO AoP (req.url ja vem sem o
// prefixo): 302 para o mesmo caminho no host da aplicacao em execucao; sem
// aplicacao, 404. getApp() devolve a aplicacao ({ origin, ... }) ou null.
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
