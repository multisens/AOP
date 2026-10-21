require('dotenv').config();

// Fail-fast: env obrigatoria ausente encerra o boot (exit 1) logo no inicio,
// em vez de erro confuso depois (ex: cliente MQTT em 'mqtt://undefined').
function assertEnv(required) {
    const missing = required.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length) {
        console.error(`[boot] missing required env vars: ${missing.join(', ')}`);
        console.error(`[boot] check docker-compose.yml or .env`);
        process.exit(1);
    }
}
assertEnv(['MQTT_HOST', 'USER_DATA_PATH', 'REDIS_HOST']);

// APPS_DOMAIN e AOP_PUBLIC_PORT (./app-hosts.js): valor invalido encerra o boot.
const appHosts = require('./app-hosts');
let APPS;
try {
    APPS = appHosts.appsConfig();
} catch (err) {
    console.error(`[boot] ${err.message}`);
    process.exit(1);
}

// MQTT por WebSocket da pagina da TV: entra pela porta do AoP, em /mqtt, e
// segue para ws://${MQTT_HOST}:${MQTT_WS_PORT} (./mqtt-ws.js).
const mqttWs = require('./mqtt-ws');
let MQTT_WS;
try {
    MQTT_WS = mqttWs.mqttWsConfig();
} catch (err) {
    console.error(`[boot] ${err.message}`);
    process.exit(1);
}

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const _PORT = process.env.PORT || 8080;

const core = require('./core');

const mod_disp = require('./modules/graphic-overlays');
const mod_prfchs = require('./modules/profile-manager/chooser');
const mod_prfmngr = require('./modules/profile-manager/manager');
const mod_appcat = require('./modules/application-catalog');
const mod_btpapp = require('./modules/bootstrap-application');

const app = express();

// Host de aplicacao (<rotulo>.<APPS_DOMAIN>) vai ao proxy da aplicacao em
// execucao; sem aplicacao, 404. Montado primeiro: um host de aplicacao nunca
// serve as paginas nem os arquivos do AoP, e o corpo chega intacto ao alvo.
app.use(appHosts.appHostProxy({ cfg: APPS, lookup: core.getGraphicsAppByLabel }));
console.log(`[apps] aplicacoes de emissora em http://<app>.${APPS.domain}` + (APPS.port === 80 ? '' : `:${APPS.port}`));

app.use(express.json());
app.use(express.urlencoded({ extended : false}));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', 'src/views');

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    next();
});

app.use(core.GUI.profile_chooser, mod_prfchs);
app.use('/profile', mod_prfmngr);
app.use(core.GUI.app_catalogue, mod_appcat);
app.use(core.GUI.bootstrap_app, mod_btpapp);
app.use('/', mod_disp);

// /graphicsAppProxy no host do AoP: 302 para o mesmo caminho no host da
// aplicacao em execucao; sem aplicacao, 404 (./app-hosts.js).
app.use('/graphicsAppProxy', appHosts.legacyGraphicsRedirect({ getApp: core.getGraphicsApp }));

// B.6.3: o proxy preserva os metadados de cache da origem (ETag,
// Last-Modified, Expires). Playlist ao vivo declara a propria validade na
// ORIGEM (simulador); nao des-cachear aqui.
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

// excecao em rota (ex.: Redis fora do ar) -> 404 {error:200} (C.3.2)
app.use(require('./http-error').platformErrorHandler);

const server = app.listen(_PORT, () => {
    console.log(`AoP running on port: ${_PORT}`);
});

// Upgrade WebSocket: so /mqtt no host do AoP vai ao broker; o resto (outro
// caminho, host de aplicacao) responde 404.
server.on('upgrade', mqttWs.mqttWsUpgrade({ apps: APPS, mqtt: MQTT_WS }));
console.log(`[mqtt-ws] MQTT por WebSocket em ws://<host do AoP>${mqttWs.MQTT_WS_PATH} -> ${MQTT_WS.target}`);

if (process.send) {
    process.send('ready');
}