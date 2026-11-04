require('dotenv').config();

// Fail-fast: a missing required env stops the boot (exit 1) at the start.
function assertEnv(required) {
    const missing = required.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length) {
        console.error(`[boot] missing required env vars: ${missing.join(', ')}`);
        console.error(`[boot] check docker-compose.yml or .env`);
        process.exit(1);
    }
}
assertEnv(['MQTT_HOST', 'USER_DATA_PATH', 'REDIS_HOST']);

// APPS_DOMAIN and AOP_PUBLIC_PORT (./app-hosts.js): an invalid value stops
// the boot.
const appHosts = require('./app-hosts');
let APPS;
try {
    APPS = appHosts.appsConfig();
} catch (err) {
    console.error(`[boot] ${err.message}`);
    process.exit(1);
}

// MQTT over WebSocket of the TV page: comes in through the AoP port, on
// /mqtt, and goes on to ws://${MQTT_HOST}:${MQTT_WS_PORT} (./mqtt-ws.js).
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

// An application host (<label>.<APPS_DOMAIN>) goes to the proxy of the
// running application; without one, 404. Mounted first: an application host
// never serves the pages or the files of the AoP, and the body reaches the
// target intact.
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

// /graphicsAppProxy on the host of the AoP: 302 to the same path on the
// host of the running application; without one, 404 (./app-hosts.js).
app.use('/graphicsAppProxy', appHosts.legacyGraphicsRedirect({ getApp: core.getGraphicsApp }));

// B.6.3: the proxy keeps the cache metadata of the origin (ETag,
// Last-Modified, Expires). A live playlist declares its own validity at the
// origin; it is not made uncacheable here.
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

// An exception in a route (e.g. Redis down) becomes 404 {error:200} (C.3.2).
app.use(require('./http-error').platformErrorHandler);

const server = app.listen(_PORT, () => {
    console.log(`AoP running on port: ${_PORT}`);
});

// WebSocket upgrade: only /mqtt on the host of the AoP goes to the broker;
// anything else (another path, an application host) answers 404.
server.on('upgrade', mqttWs.mqttWsUpgrade({ apps: APPS, mqtt: MQTT_WS }));
console.log(`[mqtt-ws] MQTT por WebSocket em ws://<host do AoP>${mqttWs.MQTT_WS_PATH} -> ${MQTT_WS.target}`);

if (process.send) {
    process.send('ready');
}