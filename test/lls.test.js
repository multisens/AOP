// aop-transport-layer-metadata-lls with Redis by a double: the received BAMT
// becomes services:announced (by the function) and the retained
// aop/services; the Application Catalog shows the services of that set.
const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const express = require('express');

const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aop-lls-'));
process.env.USER_DATA_PATH = USER_DATA;
after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

// --- doubles -----------------------------------------------------------------
// Mimics the effect of tv30_announced_services (the schema is tested on the
// real Redis, infra/redis/test); falhas = how many calls fail as with Redis
// down.
let anunciados = new Set(['urn:da-partida-anterior']);
let falhas = 0;
let recusa = null;
let smembersFora = false;
const chamadas = [];
const fakeRedis = {
    async call(cmd, nome, numkeys, ...args) {
        if (cmd !== 'FCALL' || nome !== 'tv30_announced_services' || Number(numkeys) !== 0) throw new Error(`call ${cmd} ${nome}: nao suportado pelo duble`);
        chamadas.push(args.map(String));
        if (falhas > 0) { falhas--; throw new Error('connect ECONNREFUSED (duble)'); }
        if (recusa) throw new Error(recusa);
        anunciados = new Set(args.map(String));
        return anunciados.size;
    },
    async smembers(k) {
        if (smembersFora) throw new Error('redis indisponivel (duble)');
        return k === 'services:announced' ? [...anunciados] : [];
    },
};
function stub(rel, exports) {
    const file = require.resolve(path.join(__dirname, '..', 'src', rel));
    const m = new Module(file);
    m.filename = file;
    m.loaded = true;
    m.exports = exports;
    require.cache[file] = m;
}
stub('redis-client', fakeRedis);
stub('core', {
    GUI: { app_catalogue: '/appcat', profile_chooser: '/prfchs', profile_creator: '/profile/create', bootstrap_app: '/btpapp' },
    getUserData: () => ({ name: 'Maria', avatar: null }),
    getCurrentUser: () => 'u1',
});

const lls = require('../src/modules/transport-layer-metadata-lls');
const catalogRouter = require('../src/modules/application-catalog');
const { platformErrorHandler } = require('../src/http-error');

const publicados = [];
const ultimo = () => publicados.at(-1);
const lista = (...ids) => JSON.stringify(ids.map(serviceContextId => ({ serviceContextId })));
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
const bam = (globalServiceId, appName) => ({ globalServiceId, appVersion: 1, appName, appIcon: ICON, bannerIcon: ICON, backgroundColor: '#000000', foregroundColor: '#ffffff' });
const A = 'urn:tv30:service:a', B = 'urn:tv30:service:b', C = 'urn:tv30:service:c';
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

const realError = console.error;
const realLog = console.log;
const logs = [];
console.error = console.log = (...a) => { logs.push(a.join(' ')); };
after(() => { console.error = realError; console.log = realLog; });

async function pagina() {
    const app = express();
    app.use('/appcat', catalogRouter);
    app.use(platformErrorHandler);
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/appcat`);
        return { status: res.status, body: await res.text() };
    } finally { await new Promise(r => server.close(r)); }
}
const cartoes = html => [...html.matchAll(/selectParam="([^"]*)"/g)].map(m => m[1]);

// --- owning unit -------------------------------------------------------------
test('partida: antes de qualquer BAMT grava a lista vazia (tira a da partida anterior) e publica [] retido', async () => {
    await lls.start((t, m) => publicados.push([t, m]));
    assert.deepEqual(chamadas, [[]]);
    assert.equal(anunciados.size, 0);
    assert.deepEqual(publicados, [['aop/services', '[]']]);
});

test('BAMT recebida: services:announced pela funcao, na ordem dos BAM, e o mesmo conteudo em aop/services', async () => {
    await lls.receive(JSON.stringify([bam(A, 'Canal A'), bam(B, 'Canal B')]), 'tlm/lls/bs1/bamt');
    assert.deepEqual(chamadas.at(-1), [A, B]);
    assert.deepEqual(ultimo(), ['aop/services', lista(A, B)]);
    assert.equal(lls.service(A).bam.appName, 'Canal A');
    assert.equal(lls.service(A).serviceContextId, A);
    assert.equal(lls.service('urn:nao-anunciado'), undefined);
});

test('BAMT de outro fluxo: servico repetido entra uma vez, com o BAM da recebida por ultimo', async () => {
    await lls.receive(JSON.stringify([bam(B, 'Canal B novo'), bam(C, 'Canal C')]), 'tlm/lls/bs2/bamt');
    assert.deepEqual(chamadas.at(-1), [A, B, C]);
    assert.deepEqual(ultimo(), ['aop/services', lista(A, B, C)]);
    assert.equal(lls.service(B).bam.appName, 'Canal B novo');
});

test('outras tabelas da LLS, topico fora de tlm/lls/<bsid>/bamt e BAMT que nao e JSON nao mudam a lista', async () => {
    const n = chamadas.length, p = publicados.length;
    await lls.receive('{"x":1}', 'tlm/lls/bs1/slt');
    await lls.receive(JSON.stringify([bam('urn:x', 'X')]), 'tlm/lls/bs1/extra/bamt');
    await lls.receive('nao e json', 'tlm/lls/bs3/bamt');
    await lls.receive('', 'tlm/lls/bs-desconhecido/bamt');
    assert.equal(chamadas.length, n);
    assert.equal(publicados.length, p);
    assert.ok(logs.some(l => l.includes('BAMT de bs3 ignorada')));
});

test('BAMT retirada (mensagem vazia): os servicos so daquele fluxo saem', async () => {
    await lls.receive('', 'tlm/lls/bs1/bamt');
    assert.deepEqual(chamadas.at(-1), [B, C]);
    assert.deepEqual(ultimo(), ['aop/services', lista(B, C)]);
    assert.equal(lls.service(A), undefined);
});

// --- Application Catalog -----------------------------------------------------
test('Application Catalog: a tela mostra os servicos de services:announced, com o BAM, e so eles', async () => {
    let r = await pagina();
    assert.equal(r.status, 200);
    assert.deepEqual(cartoes(r.body), [B, C]);
    assert.ok(r.body.includes('<span>Canal B novo</span>') && r.body.includes('<span>Canal C</span>'));
    // Outside the set, off the screen; in the set without a received BAM,
    // nothing to show.
    anunciados = new Set([C, 'urn:sem-bam']);
    r = await pagina();
    assert.deepEqual(cartoes(r.body), [C]);
    anunciados = new Set([B, C]);
});

test('Application Catalog: falha do Redis na leitura da lista -> 404 {error:200}', async () => {
    smembersFora = true;
    try {
        const r = await pagina();
        assert.equal(r.status, 404);
        assert.equal(JSON.parse(r.body).error, 200);
    } finally { smembersFora = false; }
});

// --- write failures ----------------------------------------------------------
test('falha do Redis: tenta de novo e so publica depois de gravar', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        falhas = 1;
        const p = publicados.length;
        await lls.receive(JSON.stringify([bam(A, 'Canal A')]), 'tlm/lls/bs1/bamt');
        assert.deepEqual(chamadas.at(-1), [B, C, A]);
        assert.equal(publicados.length, p, 'nada publicado sem o Redis gravado');
        assert.deepEqual([...anunciados], [B, C]);
        mock.timers.tick(2000);
        await settle();
        assert.deepEqual([...anunciados], [B, C, A]);
        assert.deepEqual(ultimo(), ['aop/services', lista(B, C, A)]);
        assert.ok(logs.some(l => l.includes('gravado depois de 1 falha(s)')));
    } finally { mock.timers.reset(); }
});

test('recusa do esquema: nao repete nem publica', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        recusa = 'TV30SCHEMA tv30_announced_services: services:announced member "x": has 257 characters, maximum 256';
        const n = chamadas.length, p = publicados.length;
        await lls.receive(JSON.stringify([bam('x'.repeat(257), 'Longo')]), 'tlm/lls/bs4/bamt');
        mock.timers.tick(20000);
        await settle();
        assert.equal(chamadas.length, n + 1);
        assert.equal(publicados.length, p);
        assert.ok(logs.some(l => l.includes('TV30SCHEMA tv30_announced_services')));
    } finally {
        recusa = null;
        mock.timers.reset();
    }
});
