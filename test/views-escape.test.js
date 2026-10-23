// Injecao de HTML nas telas do AoP fora dos pop-ups (catalogo, aplicacao de
// abertura, escolha de perfil), pelos routers e views REAIS com o core trocado
// por um duble: texto e atributo escapados; SVG so como <img> com URL data:.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');
const express = require('express');

const { escapeHtml, svgDataUri, svgImageHtml, svgProblem, withSvgNamespace, SVG_NS } = require('../src/html');

// --- dados -----------------------------------------------------------------------
const INJ = tag => `window.__injetado=(window.__injetado||[]).concat('${tag}')`;
// amostra como as do bcast: com o xmlns do SVG
const SAMPLE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 95" style="fill:#003461" preserveAspectRatio="xMidYMid meet"><path d="M0 0h10v10z"/></svg>';
// sem o namespace: recusado
const ICON_NO_NS = '<svg viewBox="0 0 180 95"><path d="M0 0h10v10z"/></svg>';
const HOSTILE = {
    globalServiceId: `urn:hostil" onfocus="${INJ('gsid')}" autofocus tabindex="1`,
    appName: `<img src=x onerror="${INJ('appName')}">`,
    appIcon: `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10" onload="${INJ('icon')}"><script>${INJ('icon-script')}</script></svg>`,
    appDescription: '<b>desc</b>', backgroundColor: '#202020', foregroundColor: '#e0e0e0',
};
const SAMPLE = { globalServiceId: 'urn:amostra:uff', appName: 'UFF TV', appIcon: SAMPLE_ICON, appDescription: 'A TV', backgroundColor: '#282828', foregroundColor: '#c8c8c8' };
const HOSTILE_AVATAR = `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100" onload="${INJ('avatar')}"><script>${INJ('avatar-script')}</script></svg>`;
// o campo avatar nomeia um arquivo de <USER_DATA_PATH>/thumbs; o SVG hostil
// mora em hostil.svg
const fs = require('fs');
const os = require('os');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aop-views-'));
process.env.USER_DATA_PATH = USER_DATA;
const THUMBS = path.join(USER_DATA, 'thumbs');
fs.mkdirSync(THUMBS);
fs.writeFileSync(path.join(THUMBS, 'hostil.svg'), HOSTILE_AVATAR);
const users = [
    { id: '0b6f3e2a-7c1d-4e5f-9a8b-2c3d4e5f6a7b', name: 'Maria', avatar: null },
    { id: '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d', name: '<svg/onload=alert()>', avatar: 'hostil.svg' },
    // o esquema do Redis exige UUID no id (infra/redis/esquema.json); o
    // escape no atributo e defesa a mais
    { id: `x" onfocus="${INJ('id')}`, name: 'Id hostil', avatar: null },
];
const services = new Map([[SAMPLE.globalServiceId, { bam: SAMPLE }], [HOSTILE.globalServiceId, { bam: HOSTILE }]]);
let currentService = HOSTILE.globalServiceId;

// --- duble do core -------------------------------------------------------------------
const coreFile = require.resolve('../src/core');
const fakeCore = {
    GUI: { app_catalogue: '/appcat', profile_chooser: '/prfchs', profile_creator: '/profile/create', bootstrap_app: '/btpapp' },
    getUserData: uid => users.find(u => u.id == uid) || {},
    getCurrentUser: () => users[1].id,
    getUserList: () => users,
    getCurrentService: () => services.get(currentService),
    getServiceSLS: () => ({}),
    unsetCurrentService() {}, setVideoURL() {}, setVideoSize() {}, setDisplayGui() {},
    async refreshUserData() {},
};
const m = new Module(coreFile); m.filename = coreFile; m.loaded = true; m.exports = fakeCore; require.cache[coreFile] = m;
// a unidade dona da lista de servicos (o catalogo le dela), sem Redis
const llsFile = require.resolve('../src/modules/transport-layer-metadata-lls');
const ml = new Module(llsFile); ml.filename = llsFile; ml.loaded = true; require.cache[llsFile] = ml;
ml.exports = { services: async () => [...services].map(([serviceContextId, s]) => ({ serviceContextId, bam: s.bam })) };

let server;
let base = '';
before(async () => {
    const app = express();
    app.use('/appcat', require('../src/modules/application-catalog'));
    app.use('/btpapp', require('../src/modules/bootstrap-application'));
    app.use('/prfchs', require('../src/modules/profile-manager/chooser'));
    server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));
after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

const page = async route => {
    const res = await fetch(`${base}${route}`);
    assert.equal(res.status, 200, route);
    return res.text();
};
// o que sobra do HTML sem as URLs data: (o SVG codificado nao e HTML da pagina)
const withoutDataUris = html => html.replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, 'data:...');
// marcas de HTML injetado: so podem aparecer escapadas
function assertNoInjection(html, where) {
    const h = withoutDataUris(html);
    assert.doesNotMatch(h, /\son(load|error|focus)\s*=\s*"/, `${where}: atributo de evento cru`);
    assert.doesNotMatch(h, /<img src=x/, `${where}: <img> do appName cru`);
    assert.doesNotMatch(h, /<script>window\.__injetado/, `${where}: <script> do SVG cru`);
    assert.doesNotMatch(h, /<svg[^>]*\sonload/, `${where}: SVG hostil em linha`);
    assert.doesNotMatch(h, /<svg\/onload/, `${where}: nickname hostil cru`);
}
const decode = uri => Buffer.from(uri.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
const imgSources = html => [...html.matchAll(/<img src="(data:image\/svg\+xml;base64,[^"]+)"/g)].map(x => x[1]);

// --- src/html.js -------------------------------------------------------------------
test('escapeHtml: & < > " \' escapados; nulo vira vazio', () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(42), '42');
});

test('svgDataUri: so SVG no namespace do SVG; sem xmlns, ou com outro, recusado (vazio)', () => {
    assert.equal(decode(svgDataUri(SAMPLE_ICON)), SAMPLE_ICON);
    const withNs = `<svg xmlns='${SVG_NS}' viewBox="0 0 1 1"/>`;
    assert.equal(decode(svgDataUri(withNs)), withNs);
    // prologo XML e espacos em volta
    assert.equal(decode(svgDataUri(`  <?xml version="1.0"?><svg xmlns="${SVG_NS}">x</svg> `)), `<?xml version="1.0"?><svg xmlns="${SVG_NS}">x</svg>`);
    // fora do namespace: recusado, com o motivo
    for (const v of [ICON_NO_NS, '<svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"/>', '<svg xmlns="http://example.com/x"/>']) {
        assert.equal(svgDataUri(v), '', v);
        assert.match(svgProblem(v), /fora do namespace/, v);
    }
    for (const v of [undefined, null, 42, '', 'http://x/icone.svg', 'javascript:alert(1)', '<svgx>', '<img src=x>']) {
        assert.equal(svgDataUri(v), '', String(v));
        assert.notEqual(svgProblem(v), '', String(v));
    }
});

test('withSvgNamespace: o SVG que o proprio AoP grava (avatar) ganha o xmlns quando falta', () => {
    assert.equal(withSvgNamespace(ICON_NO_NS), ICON_NO_NS.replace('<svg ', `<svg xmlns="${SVG_NS}" `));
    assert.equal(withSvgNamespace(SAMPLE_ICON), SAMPLE_ICON);
    assert.equal(withSvgNamespace('<img src=x>'), '');
});

test('svgImageHtml: icone recusado nao e exibido e sai no log com o motivo, uma vez', () => {
    const avisos = [];
    const original = console.warn;
    console.warn = m => avisos.push(String(m));
    try {
        assert.equal(svgImageHtml(ICON_NO_NS, { alt: '' }, 'appIcon do BAM de urn:teste'), '');
        assert.equal(svgImageHtml(ICON_NO_NS, { alt: '' }, 'appIcon do BAM de urn:teste'), '');
        assert.equal(svgImageHtml(undefined, {}, 'appIcon do BAM de urn:outro'), '');
    } finally { console.warn = original; }
    assert.equal(avisos.length, 1, avisos.join('\n'));
    assert.match(avisos[0], /SVG recusado.*appIcon do BAM de urn:teste.*fora do namespace/);
});

test('svgImageHtml: <img> com a URL data: e atributos escapados; sem SVG, nada', () => {
    const html = svgImageHtml(SAMPLE_ICON, { alt: '"><script>', class: 'avatar' });
    assert.match(html, /^<img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" alt="&quot;&gt;&lt;script&gt;" class="avatar">$/);
    assert.equal(svgImageHtml('nao e svg'), '');
});

// --- telas ----------------------------------------------------------------------------
test('catalogo (/appcat): appName, globalServiceId e nickname hostis escapados; icones como <img> data:', async () => {
    const html = await page('/appcat');
    assertNoInjection(html, 'catalogo');
    assert.ok(html.includes(`<span>${escapeHtml(HOSTILE.appName)}</span>`), 'appName escapado');
    assert.ok(html.includes(`selectParam="${escapeHtml(HOSTILE.globalServiceId)}"`), 'globalServiceId escapado no atributo');
    assert.ok(html.includes(`<span>${escapeHtml(users[1].name)}</span>`), 'nickname escapado');
    const srcs = imgSources(html).map(decode);
    // icones das duas aplicacoes e o avatar
    assert.ok(srcs.includes(SAMPLE_ICON), 'icone da amostra, com xmlns');
    assert.ok(srcs.includes(HOSTILE.appIcon), 'icone hostil so dentro do <img>');
    assert.ok(srcs.includes(HOSTILE_AVATAR), 'avatar hostil so dentro do <img>');
    assert.ok(html.includes('<span>UFF TV</span>'), 'nome comum sem mudanca');
});

test('aplicacao de abertura (/btpapp): icone como <img> data:, nickname escapado; amostra e hostil', async () => {
    for (const sid of [SAMPLE.globalServiceId, HOSTILE.globalServiceId]) {
        currentService = sid;
        const html = await page('/btpapp');
        assertNoInjection(html, `abertura ${sid}`);
        const bam = services.get(sid).bam;
        assert.match(html, /<div class="icon">\s*<img src="data:image\/svg\+xml;base64,/, `${sid}: icone em <img>`);
        assert.ok(imgSources(html).map(decode).some(s => s.includes('viewBox="0 0 ' + (bam === SAMPLE ? '180 95' : '10 10'))));
        // <%= %> do EJS escreve " como &#34;
        assert.ok(html.replace(/&#34;/g, '&quot;').includes(`<span class="name">${escapeHtml(bam.appName)}</span>`), `${sid}: appName escapado (<%= %>)`);
        assert.ok(html.includes(`<span>${escapeHtml(users[1].name)}</span>`), `${sid}: nickname escapado`);
    }
});

test('escolha de perfil (/prfchs): nickname e id escapados; avatares como <img> data:, o padrao inclusive', async () => {
    const html = await page('/prfchs');
    assertNoInjection(html, 'perfis');
    assert.ok(html.includes(`<span>${escapeHtml(users[1].name)}</span>`), 'nickname escapado');
    assert.ok(html.includes('<span>Maria</span>'));
    assert.ok(html.includes(`selectParam="${escapeHtml(users[2].id)}"`), 'id escapado no atributo');
    const srcs = imgSources(html).map(decode);
    const { DEFAULT_AVATAR_SVG } = require('../src/modules/profile-manager/avatar');
    assert.ok(srcs.includes(HOSTILE_AVATAR), 'avatar hostil so dentro do <img>');
    assert.ok(srcs.includes(DEFAULT_AVATAR_SVG), 'perfil sem avatar: o padrao, em <img>');
});

test('escolha de perfil (/prfchs): opcao de remover em cada perfil so com mais de um; id escapado no atributo', async () => {
    let html = await page('/prfchs');
    assertNoInjection(html, 'perfis com remocao');
    const removes = [...html.matchAll(/<div id="remove(\d+)" class="remove" [^>]*select="confirmRemoval" selectParam="([^"]*)">Remove<\/div>/g)];
    assert.deepEqual(removes.map(m => m[2]), users.map(u => escapeHtml(u.id)));
    assert.deepEqual(removes.map(m => m[1]), users.map((_, i) => String(i)));
    assert.ok(html.includes('movedown="remove0"'), 'do perfil desce para a opcao');
    const resto = users.splice(1);
    try {
        html = await page('/prfchs');
        assert.ok(!html.includes('class="remove"'), 'perfil unico: sem a opcao de remover');
        assert.ok(!html.includes('movedown="remove'));
    } finally { users.push(...resto); }
});

// duble do jQuery so com o que a confirmacao usa
function fakeJquery(state, nickname) {
    return sel => ({
        attr: name => (name === 'id' && sel === '.focused' ? state.focused : undefined),
        closest: () => ({ children: () => ({ first: () => ({ text: () => nickname }) }) }),
        text(v) { state.texts[sel] = v; return this; },
        css(k, v) { state.css[sel] = v; return this; },
        removeClass() { return this; },
        addClass() { if (sel.startsWith('#')) state.focused = sel.slice(1); return this; },
    });
}

test('confirmacao de remocao: nickname e erro entram por texto; um POST com o id inteiro; Cancelar devolve o foco', async () => {
    const html = await page('/prfchs');
    const state = { focused: 'remove1', texts: {}, css: {} };
    const calls = [];
    const ctx = vm.createContext({
        $: fakeJquery(state, users[1].name),
        fetch: (u, o) => { calls.push([u, o]); return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: '<b>recusada</b>' }) }); },
        document: { addEventListener() {} }, navigate() {},
    });
    for (const [, src] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(src, ctx);

    const id = 'urn:a&id=b"<x>#';
    vm.runInContext(`confirmRemoval(${JSON.stringify(id)})`, ctx);
    assert.equal(state.texts['#confirm-name'], users[1].name, 'nickname por .text(), nao por HTML');
    assert.equal(state.css['#confirm'], 'flex');
    assert.equal(state.focused, 'confirm-cancel', 'o foco comeca em Cancelar');

    vm.runInContext('removeProfile(); removeProfile();', ctx);
    assert.equal(calls.length, 1, 'um POST por confirmacao');
    assert.equal(calls[0][0], '/profile/remove');
    assert.equal(calls[0][1].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0][1].body), { id });
    await new Promise(r => setImmediate(r));
    assert.equal(state.texts['#confirm-error'], '<b>recusada</b>', 'mensagem da recusa por .text()');

    vm.runInContext('closeRemoval()', ctx);
    assert.equal(state.css['#confirm'], 'none');
    assert.equal(state.focused, 'remove1', 'o foco volta a opcao de remover');
});

// avatarHtml embute o arquivo nomeado no campo em <img src=data:>, com o tipo
// pela extensao; sem arquivo ou fora do formato (SVG em linha inclusive), o padrao.
test('avatarHtml: arquivo do avatar ou o padrao, sempre em <img class="avatar">; SVG em linha e nome fora do formato caem no padrao', () => {
    const { avatarHtml, DEFAULT_AVATAR_SVG, AVATAR_COLORS, MAX_AVATAR_BYTES } = require('../src/modules/profile-manager/avatar');
    const only = html => {
        const s = [...html.matchAll(/<img src="(data:[^"]+)"/g)].map(x => x[1]);
        assert.equal(s.length, 1, html);
        assert.match(html, / class="avatar"/);
        return s[0];
    };
    const svgOf = html => decode(only(html));
    const put = (name, data) => fs.writeFileSync(path.join(THUMBS, name), data);

    put('cor.svg', AVATAR_COLORS[2].svg);
    assert.equal(svgOf(avatarHtml('cor.svg')), AVATAR_COLORS[2].svg);
    assert.equal(svgOf(avatarHtml('hostil.svg')), HOSTILE_AVATAR);
    // SVG sem xmlns no arquivo (o AoP grava com ele): recusado como o icone do
    // BAM, vale o padrao
    put('sem-ns.svg', '<svg viewBox="0 0 1 1"/>');
    assert.equal(svgOf(avatarHtml('sem-ns.svg')), DEFAULT_AVATAR_SVG);
    // outras extensoes do contrato: tipo pela extensao, bytes intactos
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    for (const [name, mime] of [['p.png', 'image/png'], ['j.jpg', 'image/jpeg'], ['k.jpeg', 'image/jpeg'], ['w.webp', 'image/webp']]) {
        put(name, bytes);
        assert.equal(only(avatarHtml(name)), `data:${mime};base64,${bytes.toString('base64')}`, name);
    }

    // o padrao: ausente, SVG em linha, nome fora do formato, arquivo
    // inexistente, SVG sem <svg>, diretorio, acima do teto
    put('vazio.svg', 'nao e svg');
    put('grande.svg', `<svg xmlns="${SVG_NS}">${' '.repeat(MAX_AVATAR_BYTES)}</svg>`);
    fs.mkdirSync(path.join(THUMBS, 'pasta.svg'));
    fs.writeFileSync(path.join(USER_DATA, 'fora.svg'), AVATAR_COLORS[4].svg);
    put('x.gif', 'GIF');
    put('.oculto.svg', AVATAR_COLORS[5].svg);
    // ...sem linha de erro no log: nenhum destes e falha da plataforma
    const logs = [];
    const errorOrig = console.error;
    console.error = (...a) => logs.push(a.join(' '));
    try {
        for (const v of [null, undefined, '', 42, AVATAR_COLORS[2].svg, HOSTILE_AVATAR, '<img src=x onerror=alert(1)>',
            'nao-existe.svg', 'vazio.svg', 'grande.svg', 'pasta.svg', '../fora.svg', 'thumbs/../fora.svg', '/cor.svg', 'sub/cor.svg',
            '..\\fora.svg', 'x.gif', '.oculto.svg', 'cor.SVG', 'cor.svg ', `${'a'.repeat(129)}.svg`]) {
            assert.equal(svgOf(avatarHtml(v)), DEFAULT_AVATAR_SVG, JSON.stringify(v));
        }
    } finally { console.error = errorOrig; }
    assert.deepEqual(logs, []);
    // link simbolico para fora do diretorio: o padrao (no Windows sem
    // privilegio de link, a criacao falha e o caso nao roda)
    let linked = false;
    try { fs.symlinkSync(path.join(USER_DATA, 'fora.svg'), path.join(THUMBS, 'link.svg')); linked = true; } catch { /* sem privilegio */ }
    if (linked) assert.equal(svgOf(avatarHtml('link.svg')), DEFAULT_AVATAR_SVG, 'link para fora');
});

// --- cores no <style> e id na query --------------------------------------------
// O escape de HTML do <%= %> nao impede CSS: BAM so #RRGGBB (Tabela 6), genero
// #RRGGBB ou #RRGGBBAA; fora disso, o padrao da view. selectService e
// selectProfile codificam o ?id= ("&", "#", "+" ou "%" cortariam o id).
const { cssHexColor } = require('../src/html');
const vm = require('vm');

test('cssHexColor: so "#" e 6 hexadecimais (8 com alpha); o resto vira o fallback', () => {
    for (const v of ['#00FFFF', '#00ffff', '#282828', '#AbCdEf']) assert.equal(cssHexColor(v, 'P'), v, v);
    const bad = ['#00FFFF80', '#0FF', '00FFFF', '#00FFFG', ' #00FFFF', '#00FFFF ', '#00FFFF;', '#00FFFF\n', 'red', 'rgb(0,0,0)',
        '#00FFFF; } body { color: red', 'transparent', '', null, undefined, 42, ['#00FFFF']];
    for (const v of bad) assert.equal(cssHexColor(v, 'P'), 'P', JSON.stringify(v));
    assert.equal(cssHexColor('#07812cff', 'P', { alpha: true }), '#07812cff');
    assert.equal(cssHexColor('#07812c', 'P', { alpha: true }), '#07812c');
    for (const v of ['#07812cf', '#07812cfff', '#0f0f', '#0F0', 'transparent', '#07812cff; } x {', '#07812cff\n']) {
        assert.equal(cssHexColor(v, 'P', { alpha: true }), 'P', JSON.stringify(v));
    }
});

// as tres variaveis de cor do <style> da aplicacao de abertura
function styleVars(html) {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
    const get = n => (new RegExp(`--${n}:[ \\t]*([^;]*);`).exec(style) || [])[1];
    return { style, bg: get('background-color'), fg: get('foreground-color'), genre: get('genre-color') };
}

test('aplicacao de abertura (/btpapp): cor do BAM ou do genero fora do formato nao entra no <style> (padrao da view); no formato, entra', async () => {
    const INJ_CSS = 'red; } body { background: url(http://atacante.invalid/x.png) } :root { --x: 1';
    const INJ_CSS2 = '#fff; } * { display: none } :root { --y: 1';
    const esgWith = color => ({ esg: { Service: { validFrom: 'a', validTo: 'b', Name: { text: 'N' }, Description: { text: 'D' },
        Genre: { term: 'T', color }, ContentAdvisoryRatings: 'Livre' } } });
    const slsOrig = fakeCore.getServiceSLS;
    const currentOrig = currentService;
    const cases = [
        // [backgroundColor, foregroundColor, cor do genero] -> [fundo, texto, genero]
        [[INJ_CSS, INJ_CSS2, INJ_CSS], ['#282828', '#c8c8c8', 'transparent']],
        [['#0FF', '00FFFF', 'blue'], ['#282828', '#c8c8c8', 'transparent']],
        [['#00FFFF80', '#00FFFF;', '#07812cff; } x {'], ['#282828', '#c8c8c8', 'transparent']],
        [[undefined, null, undefined], ['#282828', '#c8c8c8', 'transparent']],
        [['#00FFFF', '#1a1a2e', '#07812cff'], ['#00FFFF', '#1a1a2e', '#07812cff']],
        [['#282828', '#c8c8c8', '#ed6f6f'], ['#282828', '#c8c8c8', '#ed6f6f']],
    ];
    try {
        for (const [[bg, fg, genre], expected] of cases) {
            services.set('urn:cores', { bam: { ...SAMPLE, globalServiceId: 'urn:cores', backgroundColor: bg, foregroundColor: fg } });
            currentService = 'urn:cores';
            fakeCore.getServiceSLS = () => esgWith(genre);
            const v = styleVars(await page('/btpapp'));
            const what = JSON.stringify([bg, fg, genre]);
            assert.deepEqual([v.bg, v.fg, v.genre], expected, what);
            assert.ok(!/atacante|display: none|--x:|--y:/.test(v.style), `CSS injetado no <style>: ${what}`);
        }
        // sem ESG: genero transparente
        fakeCore.getServiceSLS = () => ({});
        assert.equal(styleVars(await page('/btpapp')).genre, 'transparent');
    } finally {
        fakeCore.getServiceSLS = slsOrig;
        services.delete('urn:cores');
        currentService = currentOrig;
    }
});

// roda os <script> em linha da pagina com um fetch de mentira e chama a funcao
// de selecao; devolve as URLs pedidas
function selectUrls(html, fn, arg) {
    const urls = [];
    const ctx = vm.createContext({ fetch: u => { urls.push(u); return Promise.resolve(); }, document: { addEventListener() {} }, navigate() {} });
    for (const [, src] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(src, ctx);
    vm.runInContext(`${fn}(${JSON.stringify(arg)})`, ctx);
    return urls;
}

test('selectService e selectProfile: o id vai codificado na query e chega inteiro ao /select', async () => {
    const ids = ['urn:a&id=urn:b', 'urn:tv3#x', 'urn:a+b c', 'urn:100%', 'urn:x?y=1/z', 'urn:ç', '0b6f3e2a-7c1d-4e5f-9a8b-2c3d4e5f6a7b'];
    const got = [];
    fakeCore.setCurrentService = id => { got.push(id); };
    fakeCore.setCurrentUser = async id => { got.push(id); };
    try {
        for (const [route, fn] of [['/appcat', 'selectService'], ['/prfchs', 'selectProfile']]) {
            const html = await page(route);
            for (const id of ids) {
                const urls = selectUrls(html, fn, id);
                assert.deepEqual(urls, [`${route}/select?id=${encodeURIComponent(id)}`], `${fn}(${id})`);
                got.length = 0;
                const res = await fetch(`${base}${urls[0]}`);
                assert.equal(res.status, 200, `${route}/select ${id}`);
                assert.deepEqual(got, [id], `${fn}(${id}): id recebido pelo core`);
            }
        }
    } finally {
        delete fakeCore.setCurrentService;
        delete fakeCore.setCurrentUser;
    }
});
