// Testes de unidade da plataforma (node:test, sem Redis nem MQTT de verdade).
// Reuniao 05/10 com o Joel:
// - D-0510-6: cliente Redis que falha rapido e explicito (ioredis REAL contra
//   porta fechada e contra servidor que aceita e nao responde) e rota que
//   responde 404 {error:200} em vez de travar ou mascarar a falha;
// - D-0510-5: a plataforma grava o lastAccess so de perfil existente.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const Module = require('module');
const { EventEmitter } = require('events');
const Redis = require('ioredis');
const express = require('express');

const { FAIL_FAST_OPTIONS, redisOptions, logRedisEvents, whenReady } = require('../src/redis-options');
const { platformErrorHandler } = require('../src/http-error');

// --- dubles ---------------------------------------------------------------------
const FAIL = 'redis indisponivel (duble de teste)';
const store = new Map();
let down = false;
const setOf = k => (store.get(k) instanceof Set ? store.get(k) : new Set());
const fakeRedis = new Proxy({
    async eval(script, n, k1, k2, member, now) {
        if (!/SISMEMBER[\s\S]*HSET/.test(script)) throw new Error('eval: script nao suportado');
        if (!setOf(k1).has(member)) return 0;
        store.set(k2, { ...(store.get(k2) || {}), lastAccess: now });
        return 1;
    },
    async scard(k) { return setOf(k).size; },
    async smembers(k) { return [...setOf(k)]; },
    async hgetall(k) { return { ...(store.get(k) || {}) }; },
    async get(k) { return typeof store.get(k) === 'string' ? store.get(k) : null; },
    async sadd(k, ...ms) { const s = setOf(k); ms.forEach(m => s.add(m)); store.set(k, s); return ms.length; },
    async srem(k, ...ms) { const s = setOf(k); ms.forEach(m => s.delete(m)); return ms.length; },
    async del(...ks) { ks.forEach(k => store.delete(k)); return ks.length; },
    async hset(k, fields) { store.set(k, { ...(store.get(k) || {}), ...fields }); return 1; },
    async keys() { return []; },
}, {
    get(target, prop) {
        const f = target[prop];
        if (typeof f !== 'function') return f;
        return async (...args) => { if (down) throw new Error(FAIL); return f(...args); };
    },
});

function stub(rel, exports) {
    const file = require.resolve(path.join(__dirname, '..', 'src', rel));
    const m = new Module(file);
    m.filename = file;
    m.loaded = true;
    m.exports = exports;
    require.cache[file] = m;
}
stub('redis-client', fakeRedis);
const refreshed = [];
stub('core', { refreshUserData: async () => { refreshed.push(1); } });

const profiles = require('../src/modules/profile-manager/service');
const managerRouter = require('../src/modules/profile-manager/manager');

// --- utilitarios ----------------------------------------------------------------
async function closedPort() {
    const s = net.createServer().listen(0, '127.0.0.1');
    await new Promise(r => s.once('listening', r));
    const p = s.address().port;
    await new Promise(r => s.close(r));
    return p;
}
async function elapsed(p) {
    const t0 = Date.now();
    try { await p; return { ms: Date.now() - t0 }; }
    catch (err) { return { ms: Date.now() - t0, err }; }
}
async function withApp(mount, fn) {
    const app = express();
    app.use(express.json());
    mount(app);
    app.use(platformErrorHandler);
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try { return await fn(`http://127.0.0.1:${server.address().port}`); }
    finally { await new Promise(r => server.close(r)); }
}
const realError = console.error;
console.error = () => undefined;   // o handler loga cada erro; silencia no teste
after(() => { console.error = realError; });

// --- D-0510-6: cliente ----------------------------------------------------------
test('opcoes: limite por comando, poucas tentativas, fila offline ligada (antes: maxRetriesPerRequest null)', () => {
    const o = redisOptions();
    assert.equal(o.maxRetriesPerRequest, 1);
    assert.ok(o.commandTimeout < 2000);
    assert.ok(o.connectTimeout <= 2000);
    assert.equal(o.enableOfflineQueue, true);
    assert.equal(redisOptions({ port: 1 }).port, 1);
    assert.ok(Object.isFrozen(FAIL_FAST_OPTIONS));
});

test('Redis fora do ar (porta fechada): o comando rejeita em menos de 1,5 s', async () => {
    const c = new Redis(redisOptions({ host: '127.0.0.1', port: await closedPort() }));
    c.on('error', () => undefined);
    try {
        const r = await elapsed(c.get('x'));
        assert.ok(r.err, 'esperava rejeicao');
        assert.ok(r.ms < 1500, `levou ${r.ms} ms`);
    } finally { c.disconnect(); }
});

test('Redis congelado (aceita e nao responde): o comando rejeita no commandTimeout', async () => {
    const accepted = [];
    const silent = net.createServer(s => accepted.push(s)).listen(0, '127.0.0.1');
    await new Promise(r => silent.once('listening', r));
    const c = new Redis(redisOptions({ host: '127.0.0.1', port: silent.address().port, enableReadyCheck: false }));
    c.on('error', () => undefined);
    try {
        const r = await elapsed(c.get('x'));
        assert.match(r.err ? r.err.message : '', /timed out/i);
        assert.ok(r.ms >= 1400 && r.ms < 2000, `levou ${r.ms} ms`);
    } finally {
        c.disconnect();
        accepted.forEach(s => s.destroy());
        await new Promise(r => silent.close(r));
    }
});

test('log de eventos: primeira falha de cada sequencia, perda e recuperacao', () => {
    const ev = new EventEmitter();
    const lines = [];
    const realLog = console.log;
    console.log = m => lines.push(`LOG ${m}`);
    try {
        logRedisEvents(ev, 'h:1', m => lines.push(m));
        ev.emit('error', new Error('connect ECONNREFUSED'));
        ev.emit('error', new Error('connect ECONNREFUSED'));
        ev.emit('ready');
        ev.emit('close');
    } finally { console.log = realLog; }
    assert.deepEqual(lines, [
        '[redis] ERRO em h:1: connect ECONNREFUSED',
        'LOG [redis] pronto em h:1 (restabelecido apos 2 falha(s))',
        '[redis] conexao com h:1 perdida; comandos falham com erro ate reconectar',
    ]);
});

test('whenReady: tarefa de boot roda uma vez, no primeiro ready', async () => {
    const ev = new EventEmitter();
    ev.status = 'connecting';
    let runs = 0;
    whenReady(ev, 'teste', async () => { runs++; });
    ev.emit('ready');
    ev.emit('ready');
    await new Promise(r => setImmediate(r));
    assert.equal(runs, 1);
});

// --- D-0510-5: lastAccess -------------------------------------------------------
test('touchLastAccess grava so em perfil existente (sem hash fantasma)', async () => {
    store.clear();
    store.set('users:index', new Set(['user_1']));
    store.set('user:user_1', { nickname: 'Um' });
    assert.equal(await profiles.touchLastAccess('user_1', 1234), true);
    assert.equal(store.get('user:user_1').lastAccess, '1234');
    assert.equal(await profiles.touchLastAccess('desconhecido', 1234), false);
    assert.equal(store.has('user:desconhecido'), false);
    assert.equal(await profiles.touchLastAccess(''), false);
});

// --- D-0510-6: rota de criacao de perfil ----------------------------------------
test('POST /profile/create: dado invalido 400; Redis fora 404 {error:200}; ok 201', async () => {
    store.clear();
    await withApp(app => app.use('/profile', managerRouter), async base => {
        const post = body => fetch(`${base}/profile/create`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });

        let r = await post({ nickname: '' });
        assert.equal(r.status, 400);
        assert.match((await r.json()).error, /nickname/);

        down = true;
        try {
            r = await post({ nickname: 'Novo' });
            assert.equal(r.status, 404);
            const j = await r.json();
            assert.equal(j.error, 200);
            assert.match(j.description, /indisponivel/);
        } finally { down = false; }

        const before = refreshed.length;
        r = await post({ nickname: 'Novo' });
        assert.equal(r.status, 201);
        assert.equal(refreshed.length, before + 1);
    });
});

test('platformErrorHandler: excecao em rota async vira 404 {error:200}', async () => {
    await withApp(app => app.get('/x', async () => { throw new Error('falhou'); }), async base => {
        const r = await fetch(`${base}/x`);
        assert.equal(r.status, 404);
        assert.deepEqual(await r.json(), { error: 200, description: 'Platform resource unavailable: falhou' });
    });
});
