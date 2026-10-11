// Testes de unidade do P1.3 (decisao do Luis em 10/10): cada aplicacao de
// emissora na sua propria origem, http://<app>.<APPS_DOMAIN>:<porta do AoP>.
// - rotulo DNS, origem e leitura do cabecalho Host (src/app-hosts.js);
// - registro da origem PROPRIA em origins:associated ao lancar e remocao ao
//   encerrar (src/core.js, com MQTT e Redis dubles), e a URL que a camada
//   grafica recebe;
// - roteamento por Host: proxy para a aplicacao em execucao, 404 para rotulo
//   sem aplicacao, paginas do AoP intactas, e o caminho antigo
//   /graphicsAppProxy sem registro de origem.
// Sem Redis, MQTT nem bcast de verdade: o "bcast" e um servidor HTTP local.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const Module = require('module');
const { EventEmitter } = require('events');
const express = require('express');

// configuracao fixa, antes de carregar o core (que a le uma vez)
process.env.APPS_DOMAIN = 'apps.localhost';
process.env.AOP_PUBLIC_PORT = '8080';

const appHosts = require('../src/app-hosts');

// --- dubles ---------------------------------------------------------------------
const FAIL = 'redis indisponivel (duble de teste)';
const store = new Map();
let down = false;
const hashOf = k => (store.get(k) instanceof Map ? store.get(k) : new Map());
const writes = [];   // ['FCALL', funcao, ...args] de cada escrita
const fakeRedis = {
    status: 'ready',
    once() {},
    on() {},
};
// P4 (Luis, 10/10): a plataforma grava pelas funcoes do Redis
// (src/redis-funcoes.js -> call('FCALL', funcao, 0, ...)). O duble imita o
// EFEITO das funcoes de origem (sem conferir o esquema: isso e testado no
// Redis real, infra/redis/test); o lastAccess de perfil desconhecido da 0.
const ORIGENS = 'origins:associated';
let recusa = null;   // [funcao, mensagem]: a funcao responde como a dado fora do esquema
for (const [name, fn] of Object.entries({
    async call(cmd, nome, numkeys, ...args) {
        if (cmd !== 'FCALL' || Number(numkeys) !== 0) throw new Error(`call ${cmd} ${numkeys}: nao suportado pelo duble`);
        const a = args.map(String);
        if (recusa && recusa[0] === nome) throw new Error(recusa[1]);
        writes.push(['FCALL', nome, ...a]);
        const h = hashOf(ORIGENS);
        switch (nome) {
            case 'tv30_origens_limpa': return store.delete(ORIGENS) ? 1 : 0;
            case 'tv30_origem_registra': h.set(a[0], a[1]); store.set(ORIGENS, h); return 1;
            case 'tv30_origem_remove': return h.delete(a[0]) ? 1 : 0;
            case 'tv30_perfil_ultimo_acesso': return 0;
            default: throw new Error('ERR Function not found');
        }
    },
    async smembers() { return []; },
    async hgetall(k) { return Object.fromEntries(hashOf(k)); },
})) {
    fakeRedis[name] = async (...args) => { if (down) throw new Error(FAIL); return fn(...args); };
}
const origins = () => Object.fromEntries(hashOf('origins:associated'));

const published = [];   // [topico, mensagem]
const fakeMqtt = new EventEmitter();
fakeMqtt.publish = (t, m) => { published.push([t, String(m)]); };
fakeMqtt.subscribe = () => undefined;
fakeMqtt.unsubscribe = () => undefined;
const lastGraphics = () => {
    const g = published.filter(([t]) => t === 'aop/display/layers/graphics');
    return g.length ? g[g.length - 1][1] : undefined;
};

function stubFile(file, exports) {
    const m = new Module(file);
    m.filename = file;
    m.loaded = true;
    m.exports = exports;
    require.cache[file] = m;
}
stubFile(require.resolve(path.join(__dirname, '..', 'src', 'redis-client')), fakeRedis);
stubFile(require.resolve('mqtt'), { connect: () => fakeMqtt });

const quiet = { log() {}, error() {} };
const realLog = console.log;
const realError = console.error;
console.log = () => undefined;     // o core loga conexao, perfis e proxy
console.error = () => undefined;
after(() => { console.log = realLog; console.error = realError; });

// origem orfa de uma execucao anterior: a limpeza do boot do core a apaga
store.set('origins:associated', new Map([['http://orfa.apps.localhost:8080', 'svc-velho']]));
const core = require('../src/core');
const bootstrap = require('../src/modules/bootstrap-application/service');
fakeMqtt.emit('connect');

// --- utilitarios ----------------------------------------------------------------
function listen(handler) {
    return new Promise(r => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => r(s)); });
}
function close(server) { return new Promise(r => server.close(r)); }
function request(port, { host, method = 'GET', path: p = '/', body, headers = {} }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1', port, method, path: p, agent: false,
            headers: { host, ...headers, ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}) },
        }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
// "bcast": devolve o que recebeu
function fakeBcast() {
    return listen((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ bcast: true, host: req.headers.host, url: req.url, method: req.method, body }));
        });
    });
}
// AoP montado na mesma ordem do server.js
async function withAop(fn) {
    const app = express();
    app.use(appHosts.appHostProxy({ cfg: appHosts.appsConfig(), lookup: core.getGraphicsAppByLabel, log: quiet }));
    app.use(express.json());
    app.get('/', (req, res) => res.send('pagina do AoP'));
    app.post('/eco', (req, res) => res.json({ aop: true, body: req.body }));
    app.use('/graphicsAppProxy', appHosts.legacyGraphicsProxy({ getTarget: core.getGraphicsAppURL, log: quiet }));
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try { return await fn(server.address().port); }
    finally { await close(server); }
}

// --- rotulo, origem, Host -------------------------------------------------------
test('appsConfig: padrao apps.localhost e porta PORT ou 8080; valor invalido lanca erro', () => {
    assert.deepEqual({ ...appHosts.appsConfig({}) }, { domain: 'apps.localhost', port: 8080 });
    assert.deepEqual({ ...appHosts.appsConfig({ PORT: '8099' }) }, { domain: 'apps.localhost', port: 8099 });
    assert.deepEqual({ ...appHosts.appsConfig({ PORT: '8099', AOP_PUBLIC_PORT: '18080' }) }, { domain: 'apps.localhost', port: 18080 });
    assert.deepEqual({ ...appHosts.appsConfig({ APPS_DOMAIN: ' .Apps.TV30.lan. ' }) }, { domain: 'apps.tv30.lan', port: 8080 });
    assert.throws(() => appHosts.appsConfig({ APPS_DOMAIN: 'apps_tv.lan' }), /APPS_DOMAIN invalido/);
    assert.throws(() => appHosts.appsConfig({ APPS_DOMAIN: 'a..b' }), /APPS_DOMAIN invalido/);
    assert.throws(() => appHosts.appsConfig({ AOP_PUBLIC_PORT: '80a' }), /AOP_PUBLIC_PORT invalida/);
    assert.throws(() => appHosts.appsConfig({ AOP_PUBLIC_PORT: '70000' }), /AOP_PUBLIC_PORT invalida/);
});

test('appLabel: rotulo DNS valido (minusculas, [a-z0-9-], ate 63) derivado do identificador', () => {
    const valid = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    assert.equal(appHosts.appLabel('urn:tv30:app:Ab12cd'), 'urn-tv30-app-ab12cd');
    assert.equal(appHosts.appLabel('urn:tv30:service:users-test'), 'urn-tv30-service-users-test');
    assert.equal(appHosts.appLabel('  Programação__Ao vivo!  '), 'programacao-ao-vivo');
    const long = `urn:tv30:app:${'x'.repeat(80)}`;
    const l1 = appHosts.appLabel(long);
    assert.ok(l1.length <= 63 && valid.test(l1), l1);
    assert.notEqual(l1, appHosts.appLabel(`${long}y`), 'identificadores longos distintos dao rotulos distintos');
    assert.equal(appHosts.appLabel('Ação'), 'acao');
    for (const id of ['', ':::', undefined, null, '日本']) {
        const l = appHosts.appLabel(id);
        assert.ok(valid.test(l) && l.startsWith('app-'), `${id} -> ${l}`);
    }
});

test('appOrigin e entryUrl: como o navegador escreve o Origin (porta 80 omitida)', () => {
    assert.equal(appHosts.appOrigin('x', { domain: 'apps.localhost', port: 8080 }), 'http://x.apps.localhost:8080');
    assert.equal(appHosts.appOrigin('x', { domain: 'apps.tv.lan', port: 80 }), 'http://x.apps.tv.lan');
    assert.equal(appHosts.entryUrl('http://x.apps.localhost:8080', '/users-test'), 'http://x.apps.localhost:8080/users-test');
    assert.equal(appHosts.entryUrl('http://x.apps.localhost:8080', 'index.html'), 'http://x.apps.localhost:8080/index.html');
    assert.equal(appHosts.entryUrl('http://x.apps.localhost:8080', ''), 'http://x.apps.localhost:8080/');
    assert.equal(appHosts.describeApp('urn:a', 'nao-e-url', { domain: 'apps.localhost', port: 8080 }), null);
    assert.equal(appHosts.describeApp('urn:a', 'ftp://bcast/x', { domain: 'apps.localhost', port: 8080 }), null);
});

test('hostLabel: so o que esta no dominio das aplicacoes; porta e caixa nao importam', () => {
    const cfg = { domain: 'apps.localhost', port: 8080 };
    assert.equal(appHosts.hostLabel('webmedia.apps.localhost:8080', cfg), 'webmedia');
    assert.equal(appHosts.hostLabel('WebMedia.Apps.Localhost', cfg), 'webmedia');
    assert.equal(appHosts.hostLabel('webmedia.apps.localhost.:8080', cfg), 'webmedia');
    assert.equal(appHosts.hostLabel('a.b.apps.localhost:8080', cfg), 'a.b');
    for (const h of ['localhost:8080', 'apps.localhost:8080', '127.0.0.1:8080', '[::1]:8080', 'xapps.localhost', '', undefined]) {
        assert.equal(appHosts.hostLabel(h, cfg), null, String(h));
    }
});

// --- registro da origem (core) --------------------------------------------------
test('boot: a limpeza de origins:associated apaga a origem orfa', async () => {
    await new Promise(r => setImmediate(r));
    assert.deepEqual(origins(), {});
});

const SID = 'urn:tv30:service:users-test';
const BALD = [{
    appContextId: 'urn:tv30:appcontext:ctx1',
    appId: 'urn:tv30:app:k1a2b3',
    appName: 'Trocar Usuario',
    appType: 'TV30-Ginga-HTML5',
    bcastEntryPackageUrl: 'http://bcast:8081',
    bcastEntryPointUrl: '/users-test',
    controlCode: 'AUTOSTART',
}];

test('lancamento pela BALD: registra a origem PROPRIA da aplicacao (nao o alvo do proxy) e a camada grafica abre nela', async () => {
    core.setCurrentService(SID);
    fakeMqtt.emit('message', `tlm/sls/${SID}/bald`, Buffer.from(JSON.stringify(BALD)));
    await bootstrap.fullscreen();

    const origin = 'http://urn-tv30-app-k1a2b3.apps.localhost:8080';
    assert.deepEqual(origins(), { [origin]: SID });
    assert.equal(lastGraphics(), `${origin}/users-test`);
    assert.equal(core.getGraphicsAppByLabel('urn-tv30-app-k1a2b3').target, 'http://bcast:8081');
    assert.equal(core.getGraphicsAppByLabel('outra'), null);
    assert.equal(core.getGraphicsAppURL(), 'http://bcast:8081');   // alvo do caminho antigo
});

test('troca de aplicacao: remove a origem anterior e registra a nova; relancar a mesma nao a remove', async () => {
    await core.setDisplayGraphics('http://bcast:8081', '/webmedia', 'urn:tv30:app:w9');
    assert.deepEqual(origins(), { 'http://urn-tv30-app-w9.apps.localhost:8080': SID });
    assert.equal(lastGraphics(), 'http://urn-tv30-app-w9.apps.localhost:8080/webmedia');

    writes.length = 0;
    await core.setDisplayGraphics('http://bcast:8081', '/webmedia', 'urn:tv30:app:w9');
    assert.deepEqual(writes.filter(w => w[1] === 'tv30_origem_remove'), []);
    assert.deepEqual(origins(), { 'http://urn-tv30-app-w9.apps.localhost:8080': SID });
});

test('P4: registro e remocao da origem saem pelas funcoes do Redis (tv30_origem_*), na ordem remove-registra', async () => {
    writes.length = 0;
    await core.setDisplayGraphics('http://bcast:8081', '/x', 'urn:tv30:app:p4');
    await core.setDisplayGraphics('http://bcast:8081', '/y', 'urn:tv30:app:p5');
    assert.deepEqual(writes, [
        ['FCALL', 'tv30_origem_remove', 'http://urn-tv30-app-w9.apps.localhost:8080'],
        ['FCALL', 'tv30_origem_registra', 'http://urn-tv30-app-p4.apps.localhost:8080', SID],
        ['FCALL', 'tv30_origem_remove', 'http://urn-tv30-app-p4.apps.localhost:8080'],
        ['FCALL', 'tv30_origem_registra', 'http://urn-tv30-app-p5.apps.localhost:8080', SID],
    ]);
});

test('P4: registro recusado pela funcao (esquema): o lancamento rejeita com a mensagem (rota HTTP: 404 {error:200})', async () => {
    const msg = 'TV30ESQUEMA tv30_origem_registra: origins:associated nome de campo: host deve estar em minusculas';
    recusa = ['tv30_origem_registra', msg];
    try {
        await assert.rejects(core.setDisplayGraphics('http://bcast:8081', '/x', 'urn:tv30:app:q'), { message: msg });
    } finally { recusa = null; }
    await core.setDisplayGraphics('http://bcast:8081', '/y', 'urn:tv30:app:p5');
});

test('sem appId: o rotulo sai do id do servico corrente', async () => {
    await core.setDisplayGraphics('http://bcast:8081', '/uff');
    assert.deepEqual(origins(), { 'http://urn-tv30-service-users-test.apps.localhost:8080': SID });
});

test('encerramento (tecla de saida): remove a origem e esvazia a camada grafica', async () => {
    await core.openServiceInfo();
    assert.deepEqual(origins(), {});
    assert.equal(lastGraphics(), '');
    assert.equal(core.getGraphicsAppByLabel('urn-tv30-service-users-test'), null);
    assert.equal(core.getGraphicsAppURL(), '');
});

test('bcastEntryPackageUrl invalido: nada registrado nem aberto', async () => {
    await core.setDisplayGraphics('bcast:8081', '/x', 'urn:tv30:app:z');
    assert.deepEqual(origins(), {});
    assert.equal(lastGraphics(), '');
});

test('Redis fora do ar: o lancamento rejeita (rota HTTP responde 404 {error:200}, D-0510-6)', async () => {
    down = true;
    try {
        await assert.rejects(core.setDisplayGraphics('http://bcast:8081', '/x', 'urn:tv30:app:r'), { message: FAIL });
    } finally { down = false; }
    await core.setDisplayGraphics();   // limpa o estado (a origem nao chegou a ser gravada)
    assert.deepEqual(origins(), {});
});

// --- roteamento por Host --------------------------------------------------------
test('host da aplicacao vai ao proxy dela, com corpo intacto; outros hosts seguem para o AoP', async () => {
    const bcast = await fakeBcast();
    const target = `http://127.0.0.1:${bcast.address().port}`;
    try {
        await core.setDisplayGraphics(target, '/users-test', 'urn:tv30:app:h1');
        const host = 'urn-tv30-app-h1.apps.localhost:8080';
        await withAop(async port => {
            let r = await request(port, { host, path: '/users-test?x=1' });
            assert.equal(r.status, 200);
            let j = JSON.parse(r.body);
            assert.equal(j.bcast, true);
            assert.equal(j.url, '/users-test?x=1');
            assert.equal(j.host, `127.0.0.1:${bcast.address().port}`);   // changeOrigin

            r = await request(port, { host, path: '/' });   // a raiz e da aplicacao, nao a pagina do AoP
            assert.equal(JSON.parse(r.body).url, '/');

            r = await request(port, { host, method: 'POST', path: '/eco', body: '{"a":1}' });
            j = JSON.parse(r.body);
            assert.equal(j.bcast, true);
            assert.equal(j.body, '{"a":1}');

            for (const h of ['outra.apps.localhost:8080', 'a.urn-tv30-app-h1.apps.localhost:8080']) {
                r = await request(port, { host: h, path: '/users-test' });
                assert.equal(r.status, 404, h);
                assert.match(r.body, /nenhuma aplicacao em execucao/);
            }

            for (const h of ['localhost:8080', 'apps.localhost:8080', '127.0.0.1:8080']) {
                r = await request(port, { host: h, path: '/' });
                assert.equal(r.body, 'pagina do AoP', h);
            }
            r = await request(port, { host: 'localhost:8080', method: 'POST', path: '/eco', body: '{"a":1}' });
            assert.deepEqual(JSON.parse(r.body), { aop: true, body: { a: 1 } });

            await core.setDisplayGraphics();   // encerra
            r = await request(port, { host, path: '/users-test' });
            assert.equal(r.status, 404);
        });
    } finally { await close(bcast); }
});

test('caminho antigo /graphicsAppProxy: continua indo a aplicacao em execucao e nao grava origem', async () => {
    const bcast = await fakeBcast();
    try {
        await core.setDisplayGraphics(`http://127.0.0.1:${bcast.address().port}`, '/users-test', 'urn:tv30:app:l1');
        const before = origins();
        writes.length = 0;
        await withAop(async port => {
            const r = await request(port, { host: 'localhost:8080', path: '/graphicsAppProxy/users-test' });
            assert.equal(r.status, 200);
            assert.equal(JSON.parse(r.body).url, '/users-test');
        });
        assert.deepEqual(writes, []);
        assert.deepEqual(origins(), before);
        assert.equal(Object.keys(before).length, 1);
        assert.ok(!Object.keys(before).some(o => o.includes('127.0.0.1')), 'o alvo do proxy nao e registrado');
    } finally {
        await core.setDisplayGraphics();
        await close(bcast);
    }
});

test('aplicacao fora do ar: host dela responde 502; caminho antigo, 500 como antes', async () => {
    const bcast = await fakeBcast();
    const port0 = bcast.address().port;
    await close(bcast);   // porta fechada
    try {
        await core.setDisplayGraphics(`http://127.0.0.1:${port0}`, '/users-test', 'urn:tv30:app:d1');
        await withAop(async port => {
            let r = await request(port, { host: 'urn-tv30-app-d1.apps.localhost:8080', path: '/users-test' });
            assert.equal(r.status, 502);
            r = await request(port, { host: 'localhost:8080', path: '/graphicsAppProxy/users-test' });
            assert.equal(r.status, 500);
            assert.equal(r.body, 'GraphicsAppProxy Error');
        });
    } finally { await core.setDisplayGraphics(); }
});
