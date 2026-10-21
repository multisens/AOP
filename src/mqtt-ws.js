// A pagina da TV conecta o MQTT em ws(s)://<host da pagina>/mqtt e o AoP repassa o
// upgrade, com o caminho intacto, a ws://${MQTT_HOST}:${MQTT_WS_PORT}. Num host de
// aplicacao, 404: a aplicacao de emissora nao alcanca o broker pela origem dela.
// MQTT, broker e este repasse sao escolhas do testbed; a ABNT NBR 25608 nao os trata.
const { createProxyMiddleware } = require('http-proxy-middleware');
const { hostLabel } = require('./app-hosts');

const MQTT_WS_PATH = '/mqtt';
const DEFAULT_MQTT_WS_PORT = 9001;

// Valor invalido lanca erro; MQTT_WS_PORT vazio vale o padrao. MQTT_HOST e so o
// nome ou IP do broker: com porta ou caminho, o alvo sairia errado em silencio.
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
    // (host com porta nem chega aqui: ws://h:1883:9001 nao e URL valida)
    if (!host || !url || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error(`MQTT_HOST invalido para o MQTT por WebSocket: '${host}' (so o nome ou IP do broker, sem porta nem caminho)`);
    }
    // hostname do URL ja traz IPv6 entre colchetes
    return Object.freeze({ host, port, target: `ws://${url.hostname}:${port}` });
}

function pathOf(url) {
    try {
        return new URL(url || '/', 'http://aop.invalid').pathname;
    } catch {
        return null;
    }
}

// Resposta HTTP crua no socket do upgrade (nao ha objeto de resposta do
// Express aqui), e fecha.
function answer(socket, status, text) {
    const body = `${text}\n`;
    if (!socket.writable) {
        socket.destroy();
        return;
    }
    socket.end(`HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\n`
        + `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

// Ouvinte do evento 'upgrade' do servidor HTTP do AoP (server.js). apps = a
// configuracao das aplicacoes (app-hosts.appsConfig), para reconhecer o host
// de aplicacao; mqtt = mqttWsConfig().
function mqttWsUpgrade({ apps, mqtt, log = console }) {
    const proxy = createProxyMiddleware({
        target: mqtt.target,
        changeOrigin: true,
        on: {
            error: (err, req, socket) => {
                log.error(`[mqtt-ws] falha no repasse de ${req.headers.host}${req.url} para ${mqtt.target}: ${err.code || err.message}`);
                if (!socket || typeof socket.write !== 'function' || socket.destroyed) return;
                // nada escrito ainda para o navegador: 502; depois do 101, so fecha
                if (socket.bytesWritten === 0) answer(socket, '502 Bad Gateway', `broker MQTT fora do alcance (${mqtt.target})`);
                else socket.destroy();
            },
        },
    });
    return function upgrade(req, socket, head) {
        // erro no socket do navegador antes do repasse se instalar derrubaria
        // o processo (evento 'error' sem ouvinte); queda abrupta e normal
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
