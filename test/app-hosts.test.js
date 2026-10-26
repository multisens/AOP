// Tests of src/app-hosts.js and of the origin registration in src/core.js
// (MQTT and Redis doubles): label, origin, Host, origins:associated, proxy by
// Host and redirection of /graphicsAppProxy. The "bcast" is a local HTTP
// server. Also the current profile in the core (default profile at startup
// and profile removal) and the LLS delivered to the unit that owns the list
// of services.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const Module = require('module');
const { EventEmitter } = require('events');
const express = require('express');

// Fixed configuration: the core reads it once, when loaded.
process.env.APPS_DOMAIN = 'apps.localhost';
process.env.AOP_PUBLIC_PORT = '8080';

const appHosts = require('../src/app-hosts');

// --- doubles -----------------------------------------------------------------
const FAIL = 'redis indisponivel (duble de teste)';
const store = new Map();
let down = false;
const hashOf = k => (store.get(k) instanceof Map ? store.get(k) : new Map());
// ['FCALL', function, ...args] of each write.
const writes = [];
const fakeRedis = {
    status: 'ready',
    once() {},
    on() {},
};
// The double mimics the EFFECT of the origin and profile functions
// (call('FCALL', function, 0, ...)), without checking the schema; the
// lastAccess of an unknown profile gives 0.
const ORIGENS = 'origins:associated';
const INDICE = 'users:index';
const indice = () => (store.get(INDICE) instanceof Set ? store.get(INDICE) : new Set());
// [function, message]: the function answers as for data outside the schema.
let recusa = null;
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
            case 'tv30_perfil_grava': {
                const [id, n] = a;
                const campos = new Map();
                for (let i = 2 + Number(n); i + 1 < a.length; i += 2) campos.set(a[i], a[i + 1]);
                store.set(INDICE, indice().add(id));
                store.set(`user:${id}`, campos);
                return 1;
            }
            case 'tv30_perfil_ultimo_acesso': return indice().has(a[0]) ? 1 : 0;
            // The list of announced services, written at the startup of the
            // core.
            case 'tv30_servicos_anunciados': store.set('services:announced', new Set(a)); return new Set(a).size;
            default: throw new Error('ERR Function not found');
        }
    },
    async smembers(k) { return k === INDICE ? [...indice()] : []; },
    async hgetall(k) { return Object.fromEntries(hashOf(k)); },
})) {
    fakeRedis[name] = async (...args) => { if (down) throw new Error(FAIL); return fn(...args); };
}
const origins = () => Object.fromEntries(hashOf('origins:associated'));

// [topic, message, retained]
const published = [];
const fakeMqtt = new EventEmitter();
fakeMqtt.publish = (t, m, o) => { published.push([t, String(m), !!(o && o.retain)]); };
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
// The core logs connection, profiles and proxy.
console.log = () => undefined;
console.error = () => undefined;
after(() => { console.log = realLog; console.error = realError; });

// An orphan origin of a previous run: the boot cleanup of the core deletes
// it.
store.set('origins:associated', new Map([['http://orfa.apps.localhost:8080', 'svc-velho']]));
const core = require('../src/core');
const bootstrap = require('../src/modules/bootstrap-application/service');
fakeMqtt.emit('connect');

// --- utilities ---------------------------------------------------------------
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
            res.on('end', () => resolve({ status: res.statusCode, body: data, location: res.headers.location }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
// "bcast": returns what it received.
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
// AoP mounted in the same order as server.js.
async function withAop(fn) {
    const app = express();
    app.use(appHosts.appHostProxy({ cfg: appHosts.appsConfig(), lookup: core.getGraphicsAppByLabel, log: quiet }));
    app.use(express.json());
    app.get('/', (req, res) => res.send('pagina do AoP'));
    app.post('/eco', (req, res) => res.json({ aop: true, body: req.body }));
    app.use('/graphicsAppProxy', appHosts.legacyGraphicsRedirect({ getApp: core.getGraphicsApp, log: quiet }));
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try { return await fn(server.address().port); }
    finally { await close(server); }
}

// --- label, origin, Host -----------------------------------------------------
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

test('appOrigin e entryUrl: como o navegador escreve o Origin (porta 80 omitida); a URL leva /graphicsAppProxy', () => {
    assert.equal(appHosts.appOrigin('x', { domain: 'apps.localhost', port: 8080 }), 'http://x.apps.localhost:8080');
    assert.equal(appHosts.appOrigin('x', { domain: 'apps.tv.lan', port: 80 }), 'http://x.apps.tv.lan');
    assert.equal(appHosts.entryUrl('http://x.apps.localhost:8080', '/users-test'), 'http://x.apps.localhost:8080/graphicsAppProxy/users-test');
    assert.equal(appHosts.entryUrl('http://x.apps.localhost:8080', 'index.html'), 'http://x.apps.localhost:8080/graphicsAppProxy/index.html');
    assert.equal(appHosts.entryUrl('http://x.apps.localhost:8080', ''), 'http://x.apps.localhost:8080/graphicsAppProxy/');
});

test('stripPrefix: tira /graphicsAppProxy so quando ele e um segmento inteiro', () => {
    assert.equal(appHosts.stripPrefix('/graphicsAppProxy/users-test?x=1'), '/users-test?x=1');
    assert.equal(appHosts.stripPrefix('/graphicsAppProxy'), '/');
    assert.equal(appHosts.stripPrefix('/graphicsAppProxy?x=1'), '/?x=1');
    assert.equal(appHosts.stripPrefix('/graphicsAppProxyX/a'), '/graphicsAppProxyX/a');
    assert.equal(appHosts.stripPrefix('/js/navigation.js'), '/js/navigation.js');
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

// --- origin registration (core) ----------------------------------------------
test('boot: a limpeza de origins:associated apaga a origem orfa', async () => {
    await new Promise(r => setImmediate(r));
    assert.deepEqual(origins(), {});
});

// --- current profile (core) --------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function ate(cond) {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
    assert.ok(cond(), 'condicao nao atingida');
}
function perfilNoDuble(id, nickname) {
    store.set(INDICE, indice().add(id));
    store.set(`user:${id}`, new Map([['id', id], ['nickname', nickname]]));
}
function tiraDoDuble(id) {
    indice().delete(id);
    store.delete(`user:${id}`);
}

test('boot com a base sem perfil: o gestor cria o perfil padrao (Viewer 1, id UUID), que vira o perfil corrente', async () => {
    await ate(() => core.getUserList().length === 1 && core.getCurrentUser() !== '');
    const [u] = core.getUserList();
    assert.equal(u.name, 'Viewer 1');
    assert.match(u.id, UUID_RE);
    assert.equal(core.getCurrentUser(), u.id);
    const grava = writes.filter(w => w[1] === 'tv30_perfil_grava');
    assert.equal(grava.length, 1, 'um perfil padrao so');
    assert.equal(grava[0][3], '0', 'sem visibilidade para servico algum');
    assert.ok(published.some(([t, m, ret]) => t === 'aop/currentUser' && m === u.id && ret));
});

test('remocao do perfil corrente: aop/currentUser vazio (retido), aop/removedUser com o id e volta ao seletor; o corrente passa ao escolhido', async () => {
    const atual = core.getCurrentUser();
    const B = '5a9d2f4e-1c3b-4d6a-8e7f-9b0c1d2e3f4a';
    const C = '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    perfilNoDuble(B, 'B');
    perfilNoDuble(C, 'C');
    await core.refreshUserData();
    assert.equal(core.getUserList().length, 3);

    // Storage no longer has the profile (tv30_perfil_remove) when the core is
    // told.
    tiraDoDuble(atual);
    let n0 = published.length;
    core.profileRemoved(atual);
    assert.deepEqual(published.slice(n0), [
        ['aop/currentUser', '', true],
        ['aop/removedUser', atual, false],
        ['aop/display/layers/rxgui', '/prfchs', false],
    ]);
    assert.equal(core.getCurrentUser(), '');
    assert.deepEqual(core.getUserList().map(u => u.id).sort(), [B, C].sort());

    // The chooser reloads the profiles without choosing one by itself.
    n0 = published.length;
    await core.refreshUserData();
    assert.equal(core.getCurrentUser(), '');
    assert.deepEqual(published.slice(n0).filter(([t]) => t === 'aop/currentUser'), []);

    await core.setCurrentUser(B);
    assert.deepEqual(published.at(-1), ['aop/currentUser', B, true]);

    // A profile that is not the current one: aop/currentUser stays.
    tiraDoDuble(C);
    n0 = published.length;
    core.profileRemoved(C);
    assert.deepEqual(published.slice(n0), [['aop/removedUser', C, false], ['aop/display/layers/rxgui', '/prfchs', false]]);
    assert.equal(core.getCurrentUser(), B);
    assert.deepEqual(core.getUserList().map(u => u.id), [B]);
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
    assert.equal(lastGraphics(), `${origin}/graphicsAppProxy/users-test`);
    assert.equal(core.getGraphicsAppByLabel('urn-tv30-app-k1a2b3').target, 'http://bcast:8081');
    assert.equal(core.getGraphicsAppByLabel('outra'), null);
    // Target of the redirection of /graphicsAppProxy.
    assert.equal(core.getGraphicsApp().origin, origin);
});

test('troca de aplicacao: remove a origem anterior e registra a nova; relancar a mesma nao a remove', async () => {
    await core.setDisplayGraphics('http://bcast:8081', '/webmedia', 'urn:tv30:app:w9');
    assert.deepEqual(origins(), { 'http://urn-tv30-app-w9.apps.localhost:8080': SID });
    assert.equal(lastGraphics(), 'http://urn-tv30-app-w9.apps.localhost:8080/graphicsAppProxy/webmedia');

    writes.length = 0;
    await core.setDisplayGraphics('http://bcast:8081', '/webmedia', 'urn:tv30:app:w9');
    assert.deepEqual(writes.filter(w => w[1] === 'tv30_origem_remove'), []);
    assert.deepEqual(origins(), { 'http://urn-tv30-app-w9.apps.localhost:8080': SID });
});

test('registro e remocao da origem saem pelas funcoes do Redis (tv30_origem_*), na ordem remove-registra', async () => {
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

test('registro recusado pela funcao (esquema): o lancamento rejeita com a mensagem (rota HTTP: 404 {error:200})', async () => {
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
    assert.equal(core.getGraphicsApp(), null);
});

test('bcastEntryPackageUrl invalido: nada registrado nem aberto', async () => {
    await core.setDisplayGraphics('bcast:8081', '/x', 'urn:tv30:app:z');
    assert.deepEqual(origins(), {});
    assert.equal(lastGraphics(), '');
});

test('Redis fora do ar: o lancamento rejeita (rota HTTP responde 404 {error:200})', async () => {
    down = true;
    try {
        await assert.rejects(core.setDisplayGraphics('http://bcast:8081', '/x', 'urn:tv30:app:r'), { message: FAIL });
    } finally { down = false; }
    // Clears the state (the origin was never written).
    await core.setDisplayGraphics();
    assert.deepEqual(origins(), {});
});

// --- routing by Host ---------------------------------------------------------
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
            // changeOrigin
            assert.equal(j.host, `127.0.0.1:${bcast.address().port}`);

            // The root belongs to the application, not to the AoP page.
            r = await request(port, { host, path: '/' });
            assert.equal(JSON.parse(r.body).url, '/');

            // /graphicsAppProxy prefix: optional on the application host; with
            // it, it is removed from the path that goes to the target.
            r = await request(port, { host, path: '/graphicsAppProxy/users-test?x=1' });
            assert.equal(r.status, 200);
            assert.equal(JSON.parse(r.body).url, '/users-test?x=1');
            // A request from the root: a file of the application.
            r = await request(port, { host, path: '/js/navigation.js' });
            assert.equal(JSON.parse(r.body).url, '/js/navigation.js');

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

            // Ends it.
            await core.setDisplayGraphics();
            r = await request(port, { host, path: '/users-test' });
            assert.equal(r.status, 404);
        });
    } finally { await close(bcast); }
});

test('/graphicsAppProxy no host do AoP: 302 para o host da aplicacao, sem gravar origem', async () => {
    const bcast = await fakeBcast();
    try {
        await core.setDisplayGraphics(`http://127.0.0.1:${bcast.address().port}`, '/users-test', 'urn:tv30:app:l1');
        const before = origins();
        writes.length = 0;
        await withAop(async port => {
            let r = await request(port, { host: 'localhost:8080', path: '/graphicsAppProxy/users-test?x=1' });
            assert.equal(r.status, 302);
            assert.equal(r.location, 'http://urn-tv30-app-l1.apps.localhost:8080/graphicsAppProxy/users-test?x=1');
            r = await request(port, { host: 'localhost:8080', path: '/graphicsAppProxy' });
            assert.equal(r.status, 302);
            assert.equal(r.location, 'http://urn-tv30-app-l1.apps.localhost:8080/graphicsAppProxy/');
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

test('aplicacao fora do ar: host dela responde 502; sem aplicacao, /graphicsAppProxy no host do AoP responde 404', async () => {
    const bcast = await fakeBcast();
    const port0 = bcast.address().port;
    // Closed port.
    await close(bcast);
    try {
        await core.setDisplayGraphics(`http://127.0.0.1:${port0}`, '/users-test', 'urn:tv30:app:d1');
        await withAop(async port => {
            let r = await request(port, { host: 'urn-tv30-app-d1.apps.localhost:8080', path: '/users-test' });
            assert.equal(r.status, 502);
            r = await request(port, { host: 'urn-tv30-app-d1.apps.localhost:8080', path: '/graphicsAppProxy/users-test' });
            assert.equal(r.status, 502);
            // Ends it.
            await core.setDisplayGraphics();
            r = await request(port, { host: 'localhost:8080', path: '/graphicsAppProxy/users-test' });
            assert.equal(r.status, 404);
            assert.match(r.body, /nenhuma aplicacao em execucao/);
        });
    } finally { await core.setDisplayGraphics(); }
});

test('LLS no core: a BAMT vai a unidade dona, que grava services:announced e publica aop/services retido; o servico corrente sai dela', async () => {
    const servicos = () => published.filter(([t]) => t === 'aop/services');
    // At startup, before any BAMT: the empty list.
    assert.deepEqual(servicos()[0], ['aop/services', '[]', true]);
    const BAM = { globalServiceId: SID, appVersion: 1, appName: 'Users', appIcon: '<svg/>', bannerIcon: '<svg/>', backgroundColor: '#000000', foregroundColor: '#ffffff' };
    fakeMqtt.emit('message', 'tlm/lls/bs-teste/bamt', Buffer.from(JSON.stringify([BAM])));
    await ate(() => servicos().at(-1)[1] !== '[]');
    assert.deepEqual(servicos().at(-1), ['aop/services', JSON.stringify([{ serviceContextId: SID }]), true]);
    assert.deepEqual([...store.get('services:announced')], [SID]);
    core.setCurrentService(SID);
    assert.equal(core.getCurrentService().bam.appName, 'Users');
    // BAMT removed (empty retained message).
    fakeMqtt.emit('message', 'tlm/lls/bs-teste/bamt', Buffer.from(''));
    await ate(() => servicos().at(-1)[1] === '[]');
    assert.equal(store.get('services:announced').size, 0);
    assert.equal(core.getCurrentService(), undefined);
    core.unsetCurrentService();
});
