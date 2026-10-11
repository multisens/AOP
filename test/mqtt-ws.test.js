// Testes do MQTT por WebSocket na porta do AoP (C1, decisao do Luis em 11/10;
// src/mqtt-ws.js): a pagina da TV conecta em ws://<host da pagina>/mqtt e o
// AoP repassa o upgrade ao WebSocket do broker.
// - upgrade de verdade (handshake RFC 6455 e quadros nos dois sentidos) contra
//   um servidor WebSocket local no papel do mosquitto;
// - o cliente mqtt (o mesmo pacote que a pagina usa) conecta pelo AoP;
// - host de aplicacao (<app>.<APPS_DOMAIN>, P1.3) e outro caminho: 404, nada
//   chega ao broker; broker fora do ar: 502;
// - a pagina (graphic-overlays/view.ejs) conecta na propria origem, em /mqtt.
// Sem mosquitto de verdade.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const path = require('path');
const Module = require('module');
const express = require('express');
const mqtt = require('mqtt');

const appHosts = require('../src/app-hosts');
const mqttWs = require('../src/mqtt-ws');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const acceptOf = key => crypto.createHash('sha1').update(key + GUID).digest('base64');

// --- quadros WebSocket (RFC 6455), so o necessario para o teste --------------------
function encodeFrame(payload, mask) {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x82, (mask ? 0x80 : 0) | len])
        : Buffer.from([0x82, (mask ? 0x80 : 0) | 126, len >> 8, len & 0xff]);
    if (!mask) return Buffer.concat([head, payload]);
    const key = crypto.randomBytes(4);
    const body = Buffer.alloc(len);
    for (let i = 0; i < len; i++) body[i] = payload[i] ^ key[i % 4];
    return Buffer.concat([head, key, body]);
}

// Le quadros do socket; onFrame({ opcode, masked, payload }) para cada um.
function readFrames(socket, initial, onFrame) {
    let buf = initial && initial.length ? Buffer.from(initial) : Buffer.alloc(0);
    const parse = () => {
        for (;;) {
            if (buf.length < 2) return;
            const masked = (buf[1] & 0x80) !== 0;
            let len = buf[1] & 0x7f;
            let off = 2;
            if (len === 126) {
                if (buf.length < 4) return;
                len = buf.readUInt16BE(2);
                off = 4;
            } else if (len === 127) {
                throw new Error('quadro grande demais para o teste');
            }
            const need = off + (masked ? 4 : 0) + len;
            if (buf.length < need) return;
            const payload = Buffer.alloc(len);
            const key = masked ? buf.subarray(off, off + 4) : null;
            const start = off + (masked ? 4 : 0);
            for (let i = 0; i < len; i++) payload[i] = masked ? buf[start + i] ^ key[i % 4] : buf[start + i];
            const opcode = buf[0] & 0x0f;
            buf = buf.subarray(need);
            onFrame({ opcode, masked, payload });
        }
    };
    socket.on('data', d => { buf = Buffer.concat([buf, d]); parse(); });
    parse();
}

// O CONNECT ja chegou inteiro? (tamanho restante em varint, MQTT 3.1.1, 2.2.3)
function connectComplete(b) {
    let len = 0;
    let mult = 1;
    for (let i = 1; i < 5 && i < b.length; i++) {
        len += (b[i] & 0x7f) * mult;
        mult *= 128;
        if ((b[i] & 0x80) === 0) return b.length >= i + 1 + len;
    }
    return false;
}

// --- "mosquitto": servidor WebSocket local ---------------------------------------
// Conexao que comeca por CONNECT do MQTT (primeiro byte 0x10): junta o fluxo
// (o cliente pode partir um pacote em varios quadros) e, com o CONNECT
// inteiro, responde CONNACK aceito. Outra conexao: ecoa cada quadro com o
// prefixo 'eco:'. Guarda cada pedido de upgrade, cada quadro e o fluxo MQTT.
async function startBroker() {
    const upgrades = [];
    const frames = [];
    const streams = [];
    const sockets = new Set();
    const server = http.createServer((req, res) => { res.writeHead(426); res.end(); });
    server.on('upgrade', (req, socket, head) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => undefined);
        upgrades.push({ url: req.url, host: req.headers.host, protocol: req.headers['sec-websocket-protocol'] });
        const proto = req.headers['sec-websocket-protocol'] ? 'Sec-WebSocket-Protocol: mqtt\r\n' : '';
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
            + `Sec-WebSocket-Accept: ${acceptOf(req.headers['sec-websocket-key'])}\r\n${proto}\r\n`);
        let mqttStream = null;
        let connacked = false;
        readFrames(socket, head, f => {
            frames.push(f);
            if (f.opcode === 0x8) { socket.end(); return; }
            if (mqttStream === null && f.payload[0] === 0x10) { mqttStream = { bytes: Buffer.alloc(0) }; streams.push(mqttStream); }
            if (mqttStream === null) {
                socket.write(encodeFrame(Buffer.concat([Buffer.from('eco:'), f.payload]), false));
                return;
            }
            mqttStream.bytes = Buffer.concat([mqttStream.bytes, f.payload]);
            if (!connacked && connectComplete(mqttStream.bytes)) {
                connacked = true;
                socket.write(encodeFrame(Buffer.from([0x20, 0x02, 0x00, 0x00]), false));
            }
        });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return {
        port: server.address().port, upgrades, frames, streams,
        close: () => { sockets.forEach(s => s.destroy()); return new Promise(r => server.close(r)); },
    };
}

// --- "AoP": Express + o ouvinte de upgrade do src/mqtt-ws.js ----------------------
const APPS = appHosts.appsConfig({ APPS_DOMAIN: 'apps.localhost', AOP_PUBLIC_PORT: '8080' });
const logs = [];
const log = { log: m => logs.push(m), error: m => logs.push(m) };

async function startAop(brokerPort) {
    const app = express();
    app.get('/', (req, res) => res.send('pagina do aop'));
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const cfg = mqttWs.mqttWsConfig({ MQTT_HOST: '127.0.0.1', MQTT_WS_PORT: String(brokerPort) });
    server.on('upgrade', mqttWs.mqttWsUpgrade({ apps: APPS, mqtt: cfg, log }));
    const sockets = new Set();
    server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    return {
        port: server.address().port,
        close: () => { sockets.forEach(s => s.destroy()); return new Promise(r => server.close(r)); },
    };
}

// Pedido de upgrade cru, com o Host que o navegador mandaria.
function upgradeRequest(port, { host, path: p = '/mqtt' }) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({
            host: '127.0.0.1', port, path: p,
            headers: {
                Host: host, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Key': key, 'Sec-WebSocket-Protocol': 'mqtt', Origin: `http://${host}`,
            },
        });
        req.on('upgrade', (res, socket, head) => resolve({ upgraded: true, res, socket, head, key }));
        req.on('response', res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => { body += c; });
            res.on('end', () => resolve({ upgraded: false, status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

const closers = [];
after(async () => { for (const c of closers.reverse()) await c(); });

// --- configuracao -------------------------------------------------------------------
test('mqttWsConfig: alvo ws://MQTT_HOST:MQTT_WS_PORT, padrao 9001; valor invalido lanca erro', () => {
    assert.deepEqual({ ...mqttWs.mqttWsConfig({ MQTT_HOST: 'mosquitto' }) }, { host: 'mosquitto', port: 9001, target: 'ws://mosquitto:9001' });
    assert.equal(mqttWs.mqttWsConfig({ MQTT_HOST: 'mosquitto', MQTT_WS_PORT: '' }).port, 9001);
    assert.equal(mqttWs.mqttWsConfig({ MQTT_HOST: '127.0.0.1', MQTT_WS_PORT: ' 49153 ' }).target, 'ws://127.0.0.1:49153');
    assert.equal(mqttWs.mqttWsConfig({ MQTT_HOST: '[::1]', MQTT_WS_PORT: '80' }).target, 'ws://[::1]:80');
    for (const p of ['0', '65536', 'abc', '9001x', '-1', '90.1']) {
        assert.throws(() => mqttWs.mqttWsConfig({ MQTT_HOST: 'mosquitto', MQTT_WS_PORT: p }), /MQTT_WS_PORT invalida/, p);
    }
    for (const h of ['', '127.0.0.1:1883', 'broker/mqtt', 'eu@broker', '::1', 'a b']) {
        assert.throws(() => mqttWs.mqttWsConfig({ MQTT_HOST: h }), /MQTT_HOST invalido/, h);
    }
});

// --- repasse --------------------------------------------------------------------------
test('host do AoP, /mqtt: upgrade de verdade ate o broker, com quadros nos dois sentidos', async () => {
    const broker = await startBroker(); closers.push(broker.close);
    const aop = await startAop(broker.port); closers.push(aop.close);

    const r = await upgradeRequest(aop.port, { host: 'localhost:8080' });
    assert.equal(r.upgraded, true, `esperava 101, veio ${r.status} ${r.body}`);
    assert.equal(r.res.statusCode, 101);
    // a chave de aceite e a do broker para a chave deste cliente: o handshake
    // passou pelo AoP sem ser fabricado nem trocado
    assert.equal(r.res.headers['sec-websocket-accept'], acceptOf(r.key));
    assert.equal(r.res.headers['sec-websocket-protocol'], 'mqtt');
    assert.equal(broker.upgrades.length, 1);
    assert.equal(broker.upgrades[0].url, '/mqtt', 'o caminho segue como esta');
    assert.equal(broker.upgrades[0].protocol, 'mqtt');

    const reply = new Promise(resolve => readFrames(r.socket, r.head, f => resolve(f)));
    r.socket.write(encodeFrame(Buffer.from('ola'), true));
    const f = await reply;
    assert.equal(f.masked, false);
    assert.equal(f.payload.toString(), 'eco:ola');
    assert.equal(broker.frames.at(-1).masked, true, 'o quadro do cliente chega mascarado, intacto');
    assert.equal(broker.frames.at(-1).payload.toString(), 'ola');
    r.socket.destroy();
});

test('o cliente mqtt (o pacote da pagina) conecta pelo AoP em ws://<host>/mqtt', async () => {
    const broker = await startBroker(); closers.push(broker.close);
    const aop = await startAop(broker.port); closers.push(aop.close);

    const client = mqtt.connect(`ws://127.0.0.1:${aop.port}/mqtt`, { clientId: 'rp-display-teste', reconnectPeriod: 0, connectTimeout: 3000 });
    try {
        await new Promise((resolve, reject) => {
            client.once('connect', resolve);
            client.once('error', reject);
            client.once('close', () => reject(new Error('conexao fechada antes do CONNACK')));
        });
    } finally {
        await new Promise(r => client.end(true, {}, r));
    }
    assert.equal(broker.upgrades.length, 1);
    assert.equal(broker.upgrades[0].url, '/mqtt');
    assert.equal(broker.streams.length, 1, 'a conexao abriu com o CONNECT do MQTT');
    assert.ok(broker.streams[0].bytes.includes(Buffer.from('rp-display-teste')), 'CONNECT com o clientId do cliente');
});

test('host de aplicacao: /mqtt responde 404 e nada chega ao broker', async () => {
    const broker = await startBroker(); closers.push(broker.close);
    const aop = await startAop(broker.port); closers.push(aop.close);

    for (const host of ['urn-tv30-app-webmedia.apps.localhost:8080', 'qualquer.apps.localhost']) {
        const r = await upgradeRequest(aop.port, { host });
        assert.equal(r.upgraded, false, host);
        assert.equal(r.status, 404, host);
        assert.match(r.body, /so no host do AoP/);
    }
    assert.equal(broker.upgrades.length, 0);
});

test('host do AoP, outro caminho: 404 e nada chega ao broker; HTTP comum segue no Express', async () => {
    const broker = await startBroker(); closers.push(broker.close);
    const aop = await startAop(broker.port); closers.push(aop.close);

    for (const p of ['/', '/outro', '/mqtt/x', '/mqttx']) {
        const r = await upgradeRequest(aop.port, { host: 'localhost:8080', path: p });
        assert.equal(r.upgraded, false, p);
        assert.equal(r.status, 404, p);
        assert.match(r.body, /so em \/mqtt/);
    }
    assert.equal(broker.upgrades.length, 0);
    const res = await fetch(`http://127.0.0.1:${aop.port}/`);
    assert.equal(await res.text(), 'pagina do aop');
});

test('broker fora do ar: o upgrade responde 502 e o AoP registra a falha', async () => {
    const s = net.createServer().listen(0, '127.0.0.1');
    await new Promise(r => s.once('listening', r));
    const closed = s.address().port;
    await new Promise(r => s.close(r));
    const aop = await startAop(closed); closers.push(aop.close);

    logs.length = 0;
    const r = await upgradeRequest(aop.port, { host: 'localhost:8080' });
    assert.equal(r.upgraded, false);
    assert.equal(r.status, 502);
    assert.match(r.body, /broker MQTT fora do alcance/);
    assert.ok(logs.some(l => /\[mqtt-ws\] falha no repasse/.test(l) && /ECONNREFUSED/.test(l)), logs.join('\n'));
});

// --- a pagina -------------------------------------------------------------------------
test('pagina da TV (GET /): conecta o MQTT na propria origem, em /mqtt, sem porta do broker', async () => {
    // o modulo exige o core (MQTT e Redis de verdade): duble so com o usado aqui
    const coreFile = require.resolve(path.join(__dirname, '..', 'src', 'core'));
    const m = new Module(coreFile);
    m.filename = coreFile;
    m.loaded = true;
    m.exports = { GUI: { profile_chooser: '/prfchs' }, setDisplayGui() {}, openServiceInfo: async () => undefined };
    require.cache[coreFile] = m;
    const router = require('../src/modules/graphic-overlays');

    const app = express();
    app.use('/', router);
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    closers.push(() => new Promise(r => server.close(r)));
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
    assert.ok(html.includes('mqtt.connect(`${scheme}://${window.location.host}/mqtt`'), 'conecta em ws(s)://<host da pagina>/mqtt');
    assert.ok(html.includes("window.location.protocol === 'https:' ? 'wss' : 'ws'"));
    assert.equal(html.split('mqtt.connect(').length - 1, 1, 'uma conexao MQTT so');
    assert.doesNotMatch(html, /mqtt_ws_port|mqtt_host|:9001/);
});
