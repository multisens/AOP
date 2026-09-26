require('dotenv').config();

// Fail-fast: garante que envs obrigatorias estao setadas antes de qualquer
// inicializacao (MQTT, HTTP server, modules). Se faltar alguma, loga claro
// e termina com exit 1 — evita erros confusos tarde no boot (ex: cliente
// MQTT tentando conectar em 'mqtt://undefined').
function assertEnv(required) {
    const missing = required.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length) {
        console.error(`[boot] missing required env vars: ${missing.join(', ')}`);
        console.error(`[boot] check docker-compose.yml or .env`);
        process.exit(1);
    }
}
// A plataforma le perfis e escreve a lista de origens direto no Redis
// (P1) — o antigo TV3WS_URL/CCWS_URL nao e mais usado.
assertEnv(['MQTT_HOST', 'USER_DATA_PATH', 'REDIS_HOST']);

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const _PORT = process.env.PORT || 8080;

// start core component
const core = require('./core');

// import modules routes — nomes alinhados aos identificadores da norma
// (R2); os CAMINHOS DE URL vem da tabela core.GUI e não mudam aqui.
const mod_disp = require('./modules/graphic-overlays');
const mod_prfchs = require('./modules/profile-manager/chooser');
const mod_prfmngr = require('./modules/profile-manager/manager');
const mod_appcat = require('./modules/application-catalog');
const mod_btpapp = require('./modules/bootstrap-application');

// middleware configuration
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended : false}));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', 'src/views');

// allowing local clients to connect to the server
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    next();
});

// use routes
app.use(core.GUI.profile_chooser, mod_prfchs);
app.use('/profile', mod_prfmngr);
app.use(core.GUI.app_catalogue, mod_appcat);
app.use(core.GUI.bootstrap_app, mod_btpapp);
app.use('/', mod_disp);

// proxy for graphics iframe
const proxyGraphics = createProxyMiddleware({
    target: '',
    changeOrigin: true,
    router: (req) => {
        return core.getGraphicsAppURL();
    },
    pathRewrite: {
        '^/graphicsAppProxy': ''
    },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`Redirecting '${req.url}' to '${core.getGraphicsAppURL()}${proxyReq.path}'`);
        },
        error: (err, req, res) => {
            console.error('GraphicsAppProxy Error:', err);
            res.status(500).send('GraphicsAppProxy Error');
        }
    }
});
app.use('/graphicsAppProxy', proxyGraphics);

// B.6.3: o proxy respeita os metadados de cache da origem (ETag,
// Last-Modified, Expires). A politica antiga — apagar esses cabecalhos e
// forcar no-store nas playlists — era o CONTRARIO do que a norma exige
// (item 25 da vacina). Playlists de transmissao ao vivo devem declarar a
// propria validade na ORIGEM (simulador), nao ser des-cacheadas no proxy.
const proxyStream = createProxyMiddleware({
    target: '',
    changeOrigin: true,
    router: (req) => {
        return core.getVideoStreamURL();
    },
    pathRewrite: {
        '^/videoStreamProxy': ''
    },
    on: {
        error: (err, req, res) => {
            console.error('VideoStreamProxy Error:', err);
            res.status(500).send('VideoStreamProxy Error');
        }
    }
});
app.use('/videoStreamProxy', proxyStream);

app.listen(_PORT, () => {
    console.log(`AoP running on port: ${_PORT}`);
});

// notify loading is complete
if (process.send) {
    process.send('ready');
}