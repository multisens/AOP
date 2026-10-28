// The TV page connects MQTT to ws(s)://<page host>/mqtt and the AoP passes
// the upgrade, with the path intact, to ws://${MQTT_HOST}:${MQTT_WS_PORT}.
// On an application host, 404.
const { createProxyMiddleware } = require('http-proxy-middleware');
const { hostLabel } = require('./app-hosts');

const MQTT_WS_PATH = '/mqtt';
const DEFAULT_MQTT_WS_PORT = 9001;

// An invalid value throws; an empty MQTT_WS_PORT means the default.
// MQTT_HOST is only the name or IP of the broker: with a port or path, the
// target would be silently wrong.
function mqttWsConfig(env = process.env) {
    const host = String(env.MQTT_HOST || '').trim();
    const rawPort = String(env.MQTT_WS_PORT || DEFAULT_MQTT_WS_PORT).trim();
    const port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
        throw new Error(`MQTT_WS_PORT invalida: '${rawPort}' (inteiro de 1 a 65535)`);
    }
    let url = null;
    try {
        url = new URL(`ws://${host}:${port}`);
    } catch {
        url = null;
    }
    // (A host with a port does not even get here: ws://h:1883:9001 is not a
    // valid URL.)
    if (!host || !url || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error(`MQTT_HOST invalido para o MQTT por WebSocket: '${host}' (so o nome ou IP do broker, sem porta nem caminho)`);
    }
    // The hostname of the URL already has IPv6 in brackets.
    return Object.freeze({ host, port, target: `ws://${url.hostname}:${port}` });
}

function pathOf(url) {
    try {
        return new URL(url || '/', 'http://aop.invalid').pathname;
    } catch {
        return null;
    }
}

// Raw HTTP response on the upgrade socket (there is no Express response
// object here), then closes it.
function answer(socket, status, text) {
    const body = `${text}\n`;
    if (!socket.writable) {
        socket.destroy();
        return;
    }
    socket.end(`HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\n`
        + `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

// Listener of the 'upgrade' event of the HTTP server of the AoP. apps = the
// configuration of the applications (app-hosts.appsConfig), to recognize an
// application host; mqtt = mqttWsConfig().
function mqttWsUpgrade({ apps, mqtt, log = console }) {
    const proxy = createProxyMiddleware({
        target: mqtt.target,
        changeOrigin: true,
        on: {
            error: (err, req, socket) => {
                log.error(`[mqtt-ws] falha no repasse de ${req.headers.host}${req.url} para ${mqtt.target}: ${err.code || err.message}`);
                if (!socket || typeof socket.write !== 'function' || socket.destroyed) return;
                // Nothing written to the browser yet: 502; after the 101, only
                // closes.
                if (socket.bytesWritten === 0) answer(socket, '502 Bad Gateway', `broker MQTT fora do alcance (${mqtt.target})`);
                else socket.destroy();
            },
        },
    });
    return function upgrade(req, socket, head) {
        // An error on the browser socket before the passing is set up would
        // bring the process down ('error' event without a listener); an abrupt
        // drop is normal.
        socket.on('error', (err) => {
            if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
                log.error(`[mqtt-ws] erro na conexao de ${req.headers.host}${req.url}: ${err.code || err.message}`);
            }
        });
        if (hostLabel(req.headers.host, apps) !== null) {
            answer(socket, '404 Not Found', `MQTT por WebSocket so no host do AoP, nao no de uma aplicacao (${req.headers.host})`);
            return;
        }
        if (pathOf(req.url) !== MQTT_WS_PATH) {
            answer(socket, '404 Not Found', `upgrade WebSocket so em ${MQTT_WS_PATH}`);
            return;
        }
        proxy.upgrade(req, socket, head);
    };
}

module.exports = {
    MQTT_WS_PATH,
    DEFAULT_MQTT_WS_PORT,
    mqttWsConfig,
    mqttWsUpgrade,
};
