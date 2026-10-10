// Origem propria por aplicacao de emissora (P1.3, decisao do Luis em 10/10).
//
// Cada aplicacao de emissora abre num nome de host proprio, na MESMA porta do
// AoP: http://<rotulo>.<APPS_DOMAIN>:<AOP_PUBLIC_PORT>/<bcastEntryPointUrl>.
// O AoP atende esses nomes com um proxy para o alvo da aplicacao (o
// bcastEntryPackageUrl da BALD, o mesmo alvo do antigo /graphicsAppProxy), e
// o navegador passa a mandar, nas chamadas da aplicacao as APIs, o Origin
// dela — que o AoP registra em origins:associated ao lancar a aplicacao e
// remove ao encerrar (core.js). E por esse Origin que a borda e o tv3ws
// reconhecem o local associado (L1; risco do Origin forjado aceito pelo Luis
// em 03/10, D-L4).
//
// Norma x testbed: a C.4.1.7 (p. 206; p. 224 do PDF) manda o associado usar
// uma porta de origem atribuida pelo gerenciador de componentes e diz, na
// mesma secao, que o mecanismo de diferenciacao e decisao de implementacao. O
// Origin e a decisao deste testbed; nome de host por aplicacao, proxy e a
// lista no Redis tambem sao escolhas dele, nao requisito da ABNT NBR 25608.
//
// Rotulo: derivado do appId da entrada da BALD (Tabela 10, uso 1: "URN that
// uniquely identifies the Broadcaster Application"; p. 78; p. 96 do PDF) —
// minusculas, so [a-z0-9-], ate 63 caracteres (rotulo DNS). Sem appId, vale o
// id do servico corrente (core.js). O bcast gera appId novo a cada publicacao
// da BALD (cuid.slug), entao o nome do host muda a cada reinicio do bcast.
//
// LIMITE: *.localhost resolve para a maquina de QUEM abre a pagina. Com a tela
// do AoP aberta de outra maquina, os nomes <rotulo>.apps.localhost apontam
// para a maquina do visitante e as aplicacoes nao carregam. Para esse caso,
// APPS_DOMAIN deve ser um dominio resolvivel na rede, com *.<dominio>
// apontando para a maquina do AoP (DNS curinga).
//
// O antigo /graphicsAppProxy continua (legacyGraphicsProxy, abaixo) para os
// scripts de teste e o dev-host que o usam; ele NAO registra origem associada:
// a aplicacao aberta por ele fica na origem do AoP e nao e reconhecida como
// associada.
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEFAULT_APPS_DOMAIN = 'apps.localhost';
const DEFAULT_PUBLIC_PORT = 8080;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// nome completo ate 253: rotulo (63) + '.' + dominio
const MAX_DOMAIN = 253 - 64;

// Dominio das aplicacoes e porta publica do AoP (a que o NAVEGADOR usa; no
// compose, a porta publicada no host). Valor invalido lanca erro (o server.js
// encerra o boot com a mensagem).
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

// Rotulo DNS do identificador: acentos saem, o resto fora de [a-z0-9] vira
// '-', sem '-' nas pontas. Acima de 63 caracteres (ou vazio), o rotulo leva um
// resumo do identificador inteiro, para continuar distinto. Dois
// identificadores que so diferem na pontuacao (urn:a:b e urn-a-b) caem no
// mesmo rotulo.
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

// URL que a camada grafica abre: origem da aplicacao + bcastEntryPointUrl.
function entryUrl(origin, entryPoint = '') {
    const ep = entryPoint ? String(entryPoint) : '';
    return origin + (ep.startsWith('/') ? ep : `/${ep}`);
}

// Rotulo do cabecalho Host quando ele esta no dominio das aplicacoes; null
// quando nao esta (a requisicao segue para as rotas do proprio AoP). O que
// vem antes do dominio volta como esta, mesmo invalido ou com mais de um
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

// Middleware do roteamento por Host. Montado ANTES de tudo no server.js: um
// host de aplicacao nunca chega as paginas, aos arquivos estaticos nem ao
// tratamento de corpo (express.json) do AoP — o corpo segue intacto para o
// alvo. lookup(rotulo) devolve a aplicacao em execucao com esse rotulo (ou
// null).
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
        return proxy(req, res, next);
    };
}

// Caminho antigo, mantido enquanto houver quem use (scripts/test-dev-host.sh;
// curl direto): /graphicsAppProxy/<caminho> vai ao alvo da aplicacao em
// execucao, NA ORIGEM DO AoP. Nao registra origem associada (P1.3): a camada
// grafica nao usa mais este caminho.
function legacyGraphicsProxy({ getTarget, log = console }) {
    return createProxyMiddleware({
        target: '',
        changeOrigin: true,
        router: () => getTarget(),
        pathRewrite: {
            '^/graphicsAppProxy': ''
        },
        on: {
            proxyReq: (proxyReq, req) => {
                log.log(`Redirecting '${req.url}' to '${getTarget()}${proxyReq.path}'`);
            },
            error: proxyError('GraphicsAppProxy', 500, 'GraphicsAppProxy Error', log),
        },
    });
}

module.exports = {
    DEFAULT_APPS_DOMAIN,
    DEFAULT_PUBLIC_PORT,
    appsConfig,
    appLabel,
    appOrigin,
    describeApp,
    entryUrl,
    hostLabel,
    appHostProxy,
    legacyGraphicsProxy,
};
