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

const fs = require('fs');
const os = require('os');

const { FAIL_FAST_OPTIONS, redisOptions, logRedisEvents, whenReady } = require('../src/redis-options');
const { platformErrorHandler } = require('../src/http-error');

// G8 (decisao do Luis em 12/10): a criacao de perfil grava o arquivo do avatar
// em <USER_DATA_PATH>/thumbs/<id>.svg. Diretorio temporario
// por execucao.
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aop-user-files-'));
process.env.USER_DATA_PATH = USER_DATA;
const THUMBS = path.join(USER_DATA, 'thumbs');
after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

// ids de perfil em UUID (Tabela 7; decisao do Luis em 11/10, F-3): o duble
// nao confere o esquema, mas os ids sao do formato que o Redis aceita
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UM = '0b6f3e2a-7c1d-4e5f-9a8b-2c3d4e5f6a7b';
const perfil = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

// --- dubles ---------------------------------------------------------------------
const FAIL = 'redis indisponivel (duble de teste)';
const store = new Map();
let down = false;
const setOf = k => (store.get(k) instanceof Set ? store.get(k) : new Set());
// P4 (Luis, 10/10): o gestor de perfis grava pelas funcoes do Redis
// (src/redis-funcoes.js -> call('FCALL', funcao, 0, ...)). O duble imita o
// EFEITO das funcoes de perfil (sem conferir o esquema: isso e testado no
// Redis real, infra/redis/test); fcalls guarda cada chamada e recusa faz a
// funcao responder como a dado fora do esquema.
const fcalls = [];
let recusa = null;   // [funcao, mensagem]
const fakeRedis = new Proxy({
    async call(cmd, nome, numkeys, ...args) {
        if (cmd !== 'FCALL' || Number(numkeys) !== 0) throw new Error(`call ${cmd} ${numkeys}: nao suportado pelo duble`);
        const a = args.map(String);
        fcalls.push([nome, ...a]);
        if (recusa && recusa[0] === nome) throw new Error(recusa[1]);
        switch (nome) {
            case 'tv30_perfil_ultimo_acesso': {
                const [id, ms] = a;
                if (!setOf('users:index').has(id)) return 0;
                store.set(`user:${id}`, { ...(store.get(`user:${id}`) || {}), lastAccess: ms });
                return 1;
            }
            case 'tv30_perfil_grava': {
                const [id, n] = a;
                const k = Number(n);
                const h = {};
                for (let i = 2 + k; i + 1 < a.length; i += 2) h[a[i]] = a[i + 1];
                const idx = setOf('users:index'); idx.add(id); store.set('users:index', idx);
                store.set(`user:${id}`, h);
                if (k > 0) { const s = setOf(`user:${id}:consent`); a.slice(2, 2 + k).forEach(x => s.add(x)); store.set(`user:${id}:consent`, s); }
                return 1;
            }
            case 'tv30_perfil_remove': {
                const [id] = a;
                let n = setOf('users:index').delete(id) ? 1 : 0;
                for (const key of [...store.keys()]) {
                    if (key === `user:${id}` || key === `user:${id}:consent` || key.startsWith(`user:${id}:broadcaster-attrs:`)) { store.delete(key); n++; }
                }
                return n;
            }
            default: throw new Error('ERR Function not found');
        }
    },
    async scard(k) { return setOf(k).size; },
    async smembers(k) { return [...setOf(k)]; },
    async hgetall(k) { return { ...(store.get(k) || {}) }; },
    async get(k) { return typeof store.get(k) === 'string' ? store.get(k) : null; },
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
    store.set('users:index', new Set([UM]));
    store.set(`user:${UM}`, { nickname: 'Um' });
    assert.equal(await profiles.touchLastAccess(UM, 1234), true);
    assert.equal(store.get(`user:${UM}`).lastAccess, '1234');
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

// --- P4 (Luis, 10/10): escritas de perfil pelas funcoes do Redis ------------------
test('createProfile: UMA chamada tv30_perfil_grava com a visibilidade do servico ativo e a Tabela 7 em texto', async () => {
    store.clear();
    fcalls.length = 0;
    store.set('session:current-service-id', 'urn:tv30:service:users-test');
    const { user } = await profiles.createProfile({ nickname: ' Novo ', closedSigning: true, accessConsent: ['urn:a'] });
    assert.equal(fcalls.length, 1);
    const [nome, id, n, ...resto] = fcalls[0];
    assert.equal(nome, 'tv30_perfil_grava');
    assert.equal(id, user.id);
    assert.equal(n, '2');
    assert.deepEqual(resto.slice(0, 2), ['urn:a', 'urn:tv30:service:users-test']);
    const h = {};
    for (let i = 2; i < resto.length; i += 2) h[resto[i]] = resto[i + 1];
    assert.equal(h.id, user.id);
    assert.equal(h.nickname, 'Novo');
    assert.equal(h.closedSigning, 'true');
    assert.equal(h.closedSigningSide, 'right');
    assert.equal(h.closedSigningWidth, '28');
    assert.equal(h.parentalControl, 'false');
    assert.equal(h.maxContentRating, undefined, 'condicional falso fica fora do hash');
    assert.match(h.lastAccess, /^[1-9]\d*$/);
    // F-3 (decisao do Luis em 11/10): id em UUID (Tabela 7), formato da RFC
    // 9562 em minusculas; dois perfis nunca recebem o mesmo
    assert.match(user.id, UUID_RE);
    const { user: outro } = await profiles.createProfile({ nickname: 'Outro' });
    assert.match(outro.id, UUID_RE);
    assert.notEqual(outro.id, user.id);
});

// Joel, 15/10 ("Observacoes sobre pontos fora da lista"): o sexto perfil e
// recusado, com a mensagem para o formulario, e nenhum perfil e despejado (ate
// 15/10, P3, o de ultimo acesso mais antigo saia).
test('limite de cinco: o sexto perfil e recusado (ValidationError), sem despejo nem gravacao', async () => {
    store.clear();
    fcalls.length = 0;
    const idx = new Set();
    for (let i = 1; i <= 5; i++) {
        idx.add(perfil(i));
        store.set(`user:${perfil(i)}`, { nickname: `P${i}`, lastAccess: String(1000 + i) });
    }
    store.set(`user:${perfil(3)}:broadcaster-attrs:urn:s`, { a: '1' });
    store.set('users:index', idx);
    await assert.rejects(profiles.createProfile({ nickname: 'Sexto' }),
        err => err instanceof profiles.ValidationError && /limite de 5 perfis/.test(err.message));
    assert.deepEqual(fcalls, [], 'nenhuma funcao do Redis chamada');
    assert.equal(setOf('users:index').size, 5);
    assert.equal(store.has(`user:${perfil(3)}:broadcaster-attrs:urn:s`), true);

    // com quatro, o quinto e criado
    idx.delete(perfil(5));
    store.delete(`user:${perfil(5)}`);
    const { user } = await profiles.createProfile({ nickname: 'Quinto' });
    assert.match(user.id, UUID_RE);
});

test('POST /profile/create: idioma ou visibilidade fora do esquema 400 (antes de gravar); recusa da funcao 404 {error:200}', async () => {
    store.clear();
    await withApp(app => app.use('/profile', managerRouter), async base => {
        const post = body => fetch(`${base}/profile/create`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        fcalls.length = 0;
        for (const body of [
            { nickname: 'X', audioLanguage: 'Português' },
            { nickname: 'X', userInterfaceLanguage: 'pt_BR' },
            { nickname: 'X', closedCaptioning: true, closedCaptioningLanguage: 'p' },
            { nickname: 'X', accessConsent: [''] },
            { nickname: 'X', accessConsent: 'urn:a' },
            { nickname: 'X', accessConsent: ['x'.repeat(257)] },
        ]) {
            const r = await post(body);
            assert.equal(r.status, 400, JSON.stringify(body));
        }
        assert.deepEqual(fcalls, [], 'nada chega a funcao');
        // idioma de legenda com a legenda desligada nao e gravado: nao recusa
        let r = await post({ nickname: 'X', closedCaptioning: false, closedCaptioningLanguage: 'qualquer coisa' });
        assert.equal(r.status, 201);

        const msg = `TV30ESQUEMA tv30_perfil_grava: user:${UM} campo nickname: tem 21 caracteres, maximo 20`;
        recusa = ['tv30_perfil_grava', msg];
        try {
            r = await post({ nickname: 'Novo' });
            assert.equal(r.status, 404);
            const j = await r.json();
            assert.equal(j.error, 200);
            assert.ok(j.description.includes(msg), j.description);
        } finally { recusa = null; }
    });
});

// --- G8 (decisao do Luis em 12/10): avatar = nome de arquivo das miniaturas ------
// Tabela 7: "avatar" e "file path". O gestor grava o SVG do formulario em
// <USER_DATA_PATH>/thumbs/<id>.svg (o USER_THUMBS do tv3ws, que o entrega pela
// C.6.14.6) e o campo avatar recebe o nome do arquivo; a criacao que falha apaga o
// arquivo. Antes, o campo levava o SVG em linha.
const { AVATAR_COLORS, DEFAULT_AVATAR_SVG } = require('../src/modules/profile-manager/avatar');
// formato do contrato (spec-1210-g8g9; o mesmo do esquema do Redis)
const AVATAR_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(svg|png|jpg|jpeg|webp)$/;
const SVG_NS = 'http://www.w3.org/2000/svg';
// campos do hash na chamada tv30_perfil_grava <id> <n> <consent x n> <campo valor ...>
const hashOfCall = call => {
    const [, , n, ...resto] = call;
    const h = {};
    for (let i = Number(n); i + 1 < resto.length; i += 2) h[resto[i]] = resto[i + 1];
    return h;
};
const thumbFiles = () => (fs.existsSync(THUMBS) ? fs.readdirSync(THUMBS).sort() : []);
const readThumb = name => fs.readFileSync(path.join(THUMBS, name), 'utf8');

test('G8: createProfile grava o SVG do formulario em <thumbs>/<id>.svg e o avatar e o nome do arquivo', async () => {
    store.clear();
    fcalls.length = 0;
    fs.rmSync(THUMBS, { recursive: true, force: true });   // o diretorio e criado se faltar
    const svg = AVATAR_COLORS[3].svg;
    const { user } = await profiles.createProfile({ nickname: 'Arquivo', avatar: svg });
    assert.equal(user.avatar, `${user.id}.svg`);
    assert.match(user.avatar, AVATAR_NAME_RE);
    assert.equal(hashOfCall(fcalls[0]).avatar, user.avatar, 'campo avatar gravado no Redis = nome do arquivo');
    assert.deepEqual(thumbFiles(), [user.avatar]);
    assert.equal(readThumb(user.avatar), svg, 'conteudo = o SVG enviado');

    // SVG sem xmlns: o arquivo (image/svg+xml) leva o namespace
    const { user: semNs } = await profiles.createProfile({ nickname: 'SemNs', avatar: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>' });
    assert.equal(readThumb(semNs.avatar), `<svg xmlns="${SVG_NS}" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`);

    // pela rota: a resposta traz o nome
    await withApp(app => app.use('/profile', managerRouter), async base => {
        const r = await fetch(`${base}/profile/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: 'Rota', avatar: AVATAR_COLORS[1].svg }) });
        assert.equal(r.status, 201);
        const j = await r.json();
        assert.equal(j.user.avatar, `${j.user.id}.svg`);
        assert.equal(readThumb(j.user.avatar), AVATAR_COLORS[1].svg);
    });
});

test('G8: avatar ausente ou que nao e SVG (conferido como as telas conferiam) grava o padrao', async () => {
    for (const avatar of [undefined, null, '', 'a.png', 'c3167a18-5dc5-4a6e-9b1d-3f2a7c5e8d10.svg', '<img src=x onerror=alert(1)>',
        ' <svg viewBox="0 0 1 1"/>', '<svgx>', 42, ['<svg/>']]) {
        store.clear();
        const { user } = await profiles.createProfile({ nickname: 'Padrao', avatar });
        assert.equal(readThumb(user.avatar), DEFAULT_AVATAR_SVG, JSON.stringify(avatar));
    }
    // SVG hostil passa (como antes, quando ia em linha): as telas o mostram so
    // dentro de <img> (test/views-escape.test.js)
    store.clear();
    const hostil = `<svg xmlns="${SVG_NS}" onload="alert(1)"><script>alert(2)</script></svg>`;
    const { user } = await profiles.createProfile({ nickname: 'Hostil', avatar: hostil });
    assert.equal(readThumb(user.avatar), hostil);
});

test('G8: perfil recusado pela funcao apaga o arquivo; falha ao gravar o arquivo nao grava o perfil', async () => {
    store.clear();
    fs.rmSync(THUMBS, { recursive: true, force: true });
    fcalls.length = 0;
    recusa = ['tv30_perfil_grava', `TV30ESQUEMA tv30_perfil_grava: user:${UM} campo avatar: fora do formato`];
    try {
        await assert.rejects(profiles.createProfile({ nickname: 'Recusado' }), /TV30ESQUEMA/);
    } finally { recusa = null; }
    assert.equal(fcalls.filter(c => c[0] === 'tv30_perfil_grava').length, 1);
    assert.deepEqual(thumbFiles(), [], 'arquivo apagado depois da recusa');

    // diretorio de miniaturas impossivel (um arquivo no lugar): nada no Redis
    fs.rmSync(THUMBS, { recursive: true, force: true });
    fs.writeFileSync(THUMBS, 'nao e diretorio');
    fcalls.length = 0;
    try {
        await assert.rejects(profiles.createProfile({ nickname: 'SemDir' }));
        assert.deepEqual(fcalls.filter(c => c[0] === 'tv30_perfil_grava'), [], 'perfil nao gravado sem o arquivo');
    } finally { fs.rmSync(THUMBS, { force: true }); }
});

test('G8: o sexto perfil recusado nao grava arquivo de avatar; POST /profile/create responde 400 com a mensagem', async () => {
    store.clear();
    fcalls.length = 0;
    fs.rmSync(THUMBS, { recursive: true, force: true });
    fs.mkdirSync(THUMBS, { recursive: true });
    const idx = new Set();
    for (let i = 1; i <= 5; i++) {
        idx.add(perfil(i));
        store.set(`user:${perfil(i)}`, { nickname: `P${i}`, avatar: `${perfil(i)}.svg`, lastAccess: String(1000 + i) });
        fs.writeFileSync(path.join(THUMBS, `${perfil(i)}.svg`), DEFAULT_AVATAR_SVG);
    }
    store.set('users:index', idx);
    const antes = thumbFiles();
    await withApp(app => app.use('/profile', managerRouter), async base => {
        const r = await fetch(`${base}/profile/create`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: 'Sexto' }),
        });
        assert.equal(r.status, 400);
        assert.match((await r.json()).error, /limite de 5 perfis/);
    });
    assert.deepEqual(thumbFiles(), antes);
    assert.deepEqual(fcalls, []);
});

test('platformErrorHandler: excecao em rota async vira 404 {error:200}', async () => {
    await withApp(app => app.get('/x', async () => { throw new Error('falhou'); }), async base => {
        const r = await fetch(`${base}/x`);
        assert.equal(r.status, 404);
        assert.deepEqual(await r.json(), { error: 200, description: 'Platform resource unavailable: falhou' });
    });
});
