// Pop-ups of the graphics layer (public/js/popup.js and the passing on of
// graphic-overlays/view.ejs), in a vm context with doubles of jQuery
// (#popup), QRCode, the clock and the MQTT publication; the real drawing is
// in Chrome.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POPUP_JS = path.join(__dirname, '..', 'public', 'js', 'popup.js');
const VIEW = path.join(__dirname, '..', 'src', 'modules', 'graphic-overlays', 'view.ejs');
const QR = 'aop/display/layers/popup/qrcode';
const PIN = 'aop/display/layers/popup/pin';
const YESNO = 'aop/display/layers/popup/yesno/message';
const CLOSE = '{"close":true}';
// tv3ws: PAIRING_POPUP_TIMEOUT_MS
const PRAZO = 120000;

// Inline script of the page with mqtt_message (the first <script> without
// src).
function viewScript() {
    const html = fs.readFileSync(VIEW, 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const s = scripts.find(c => c.includes('function mqtt_message'));
    assert.ok(s, 'mqtt_message em view.ejs');
    return s;
}

function page() {
    // Test clock.
    let now = 0;
    let seq = 0;
    const timers = new Map();
    const setTimeout = (fn, ms) => { const id = ++seq; timers.set(id, { at: now + (Number(ms) || 0), fn }); return id; };
    const clearTimeout = id => { timers.delete(id); };
    const advance = ms => {
        const end = now + ms;
        for (;;) {
            const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!due) break;
            timers.delete(due[0]);
            now = due[1].at;
            due[1].fn();
        }
        now = end;
    };

    // #popup: only what popup.js uses.
    const el = { html: '', visible: false, height: '' };
    const popupEl = {
        html(s) { if (s === undefined) return el.html; el.html = s; return popupEl; },
        height(h) { el.height = h; return popupEl; },
        show() { el.visible = true; return popupEl; },
        hide() { el.visible = false; return popupEl; },
    };
    const $ = sel => {
        if (sel === '#popup') return popupEl;
        throw new Error(`seletor nao previsto no duble: ${sel}`);
    };
    const qrcodes = [];
    function QRCode(target, opts) { qrcodes.push({ target, text: opts.text }); }
    const document = { getElementById: id => (id === 'qrcode' && el.html.includes('id="qrcode"') ? { id } : null) };
    const warnings = [];
    const console = { log() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')) };

    const ctx = vm.createContext({ $, QRCode, document, console, setTimeout, clearTimeout });
    ctx.window = ctx;
    vm.runInContext(fs.readFileSync(POPUP_JS, 'utf8'), ctx, { filename: 'popup.js' });
    vm.runInContext(viewScript(), ctx, { filename: 'view.ejs' });
    const published = [];
    // The list and the pair come from this side (deepEqual compares the Array
    // prototype).
    ctx.__publish = (t, m) => published.push([t, m]);
    vm.runInContext('publishTopic = (t, m) => __publish(t, m);', ctx);

    const deliver = (topic, msg) => vm.runInContext('mqtt_message', ctx)(null, topic, Buffer.from(msg));
    const state = () => vm.runInContext('({ has_popup, popup_type, yesno_popup })', ctx);
    return { ctx, el, deliver, state, advance, timers, qrcodes, published, warnings };
}
const open = (value, timeout = PRAZO) => JSON.stringify({ value, timeout });

test('QR code: fica na tela ate o {"close":true} no mesmo topico', () => {
    const p = page();
    p.deliver(QR, open('chave-base64url'));
    assert.equal(p.el.visible, true);
    assert.match(p.el.html, /QR code/);
    assert.deepEqual(p.qrcodes.map(q => q.text), ['chave-base64url']);
    assert.equal(p.state().popup_type, 'qrcode');

    p.advance(1000);
    assert.equal(p.el.visible, true, 'o QR code nao sai em 1 s');
    p.advance(100000);
    assert.equal(p.el.visible, true);

    p.deliver(QR, CLOSE);
    assert.equal(p.el.visible, false);
    assert.equal(p.el.html, '');
    assert.equal(p.state().has_popup, false);
    assert.equal(p.timers.size, 0, 'prazo do pop-up fechado cancelado');
});

test('PIN: fica na tela ate o {"close":true} no mesmo topico', () => {
    const p = page();
    p.deliver(PIN, open('0042'));
    assert.equal(p.el.visible, true);
    assert.match(p.el.html, /0042/);
    p.advance(60000);
    assert.equal(p.el.visible, true);
    p.deliver(PIN, CLOSE);
    assert.equal(p.el.visible, false);
});

test('trava de seguranca: sem fechamento, o pop-up sai no prazo da abertura', () => {
    const p = page();
    p.deliver(PIN, open('1234'));
    p.advance(PRAZO - 1);
    assert.equal(p.el.visible, true);
    p.advance(1);
    assert.equal(p.el.visible, false);
    assert.equal(p.state().has_popup, false);
});

test('fechamento de outro tipo nao fecha o pop-up na tela', () => {
    const p = page();
    p.deliver(PIN, open('0042'));
    p.deliver(QR, CLOSE);
    assert.equal(p.el.visible, true);
    assert.match(p.el.html, /0042/);

    // The QR code replaces the PIN.
    p.deliver(QR, open('chave'));
    p.deliver(PIN, CLOSE);
    assert.equal(p.el.visible, true);
    assert.equal(p.state().popup_type, 'qrcode');
    p.deliver(QR, CLOSE);
    assert.equal(p.el.visible, false);
});

test('{"close":true} no sim/nao nao fecha o sim/nao (so QR code e PIN fecham assim)', () => {
    const p = page();
    p.deliver(YESNO, open('Autoriza?', 10000));
    p.deliver(YESNO, CLOSE);
    assert.equal(p.el.visible, true);
    assert.equal(p.state().popup_type, 'yesno');
    assert.deepEqual(p.published, []);
});

test('fechamento sem pop-up na tela: nada acontece', () => {
    const p = page();
    p.deliver(QR, CLOSE);
    p.deliver(PIN, CLOSE);
    assert.equal(p.el.visible, false);
    assert.equal(p.state().has_popup, false);
});

test('mensagem invalida nao lanca e nao muda a tela', () => {
    const p = page();
    p.deliver(QR, open('chave'));
    const before = { ...p.el };
    for (const bad of ['nao-json', '', '{', 'null', '[]', '"texto"', '42', 'true', '{}', '{"value":5}',
        '{"close":"true"}', '{"close":1}', '{"close":false}', '{"value":null,"timeout":1000}']) {
        assert.doesNotThrow(() => p.deliver(QR, bad), bad);
        assert.doesNotThrow(() => p.deliver(PIN, bad), bad);
        assert.deepEqual(p.el, before, `tela intacta com ${JSON.stringify(bad)}`);
    }
    // An unknown type and a topic without a type.
    assert.doesNotThrow(() => p.deliver('aop/display/layers/popup/xyz', open('x')));
    assert.doesNotThrow(() => p.deliver('aop/display/layers/popup', open('x')));
    assert.deepEqual(p.el, before);
    assert.equal(p.qrcodes.length, 1);
    assert.ok(p.warnings.length > 0, 'mensagens ignoradas vao para o console');
    // The page keeps handling messages.
    p.deliver(QR, CLOSE);
    assert.equal(p.el.visible, false);
});

test('prazo de um pop-up que ja saiu nao fecha o seguinte', () => {
    const p = page();
    // Deadline of A: t = 120 s.
    p.deliver(QR, open('A'));
    p.advance(100000);
    // A paired at t = 100 s.
    p.deliver(QR, CLOSE);
    p.advance(10000);
    // Deadline of B: t = 230 s.
    p.deliver(QR, open('B'));
    // t = 125 s: the deadline of A has passed.
    p.advance(15000);
    assert.equal(p.el.visible, true, 'B continua na tela');
    assert.deepEqual(p.qrcodes.map(q => q.text), ['A', 'B']);
    // t = 230 s
    p.advance(105000);
    assert.equal(p.el.visible, false);
});

test('pop-up substituido: o prazo do anterior nao vale mais', () => {
    const p = page();
    p.deliver(PIN, open('1111', 5000));
    p.deliver(QR, open('chave'));
    p.advance(6000);
    assert.equal(p.el.visible, true, 'o prazo de 5 s do PIN nao fecha o QR code');
    assert.equal(p.state().popup_type, 'qrcode');
});

test('sim/nao: "Sim" publica true e as teclas voltam a pagina; o prazo publica false', () => {
    const p = page();
    p.deliver(YESNO, open('Autoriza?', 10000));
    assert.equal(p.state().yesno_popup, true);
    vm.runInContext('window.PopupYes()', p.ctx);
    assert.deepEqual(p.published, [['aop/display/layers/popup/yesno/response', 'true']]);
    assert.equal(p.el.visible, false);
    assert.equal(p.state().yesno_popup, false, 'relay_key volta a repassar as teclas');
    p.advance(20000);
    assert.equal(p.published.length, 1, 'o prazo do sim/nao respondido nao publica nada');

    p.deliver(YESNO, open('De novo?', 10000));
    p.advance(10000);
    assert.deepEqual(p.published[1], ['aop/display/layers/popup/yesno/response', 'false']);
    assert.equal(p.el.visible, false);
});

test('sim/nao substituido pelo QR code: sem resposta atrasada do sim/nao, teclas fora dos botoes', () => {
    const p = page();
    p.deliver(YESNO, open('Autoriza?', 10000));
    p.deliver(QR, open('chave'));
    assert.equal(p.state().yesno_popup, false);
    assert.equal(vm.runInContext('window.PopupYes', p.ctx), null);
    p.advance(20000);
    assert.deepEqual(p.published, [], 'o prazo do sim/nao substituido nao responde por ele');
    assert.equal(p.el.visible, true);
});

test('excecao no tratamento de uma mensagem nao escapa para o cliente MQTT da pagina', () => {
    const p = page();
    // connect() of view.ejs with an MQTT client double.
    const handlers = {};
    const fakeClient = { on: (ev, h) => { handlers[ev] = h; }, subscribe() {}, publish() {} };
    p.ctx.mqtt = { connect: () => fakeClient };
    p.ctx.location = { protocol: 'http:', host: 'tv.test' };
    p.ctx.fetch = () => undefined;
    vm.runInContext('connect()', p.ctx);
    // video/size with invalid JSON: the JSON.parse of mqtt_message throws
    assert.doesNotThrow(() => handlers.message('aop/display/layers/video/size', Buffer.from('{')));
    assert.ok(p.warnings.some(w => /video\/size nao tratada/.test(w)), p.warnings.join(' | '));
    // and the page keeps handling the next messages.
    handlers.message(QR, Buffer.from(open('chave')));
    assert.equal(p.el.visible, true);
    handlers.message(QR, Buffer.from(CLOSE));
    assert.equal(p.el.visible, false);
});

// --- HTML injection in the pop-up --------------------------------------------
// Yes/no message as tv3ws builds it (api/client-identification/service.ts,
// askAuthorization), with the display-name chosen by the client.
const askMessage = displayName => `A aplicação "${displayName}" deseja acessar as informações do sinal de TV Digital.\nVocê deseja autorizar isto?`;
const INJECAO = '<img src=x onerror="window.__injetado=1">';
const INJECAO_ESCAPADA = '&lt;img src=x onerror=&quot;window.__injetado=1&quot;&gt;';

test('sim/nao: display-name com HTML entra escapado, e os botoes seguem os do pop-up', () => {
    const p = page();
    p.deliver(YESNO, open(askMessage(INJECAO), 10000));
    assert.equal(p.el.visible, true);
    assert.ok(p.el.html.includes(INJECAO_ESCAPADA), p.el.html);
    assert.ok(!p.el.html.includes('<img'), `HTML do display-name na tela: ${p.el.html}`);
    // The rest of the pop-up is the fixed markup of popup.js.
    assert.equal((p.el.html.match(/<span /g) || []).length, 1);
    assert.match(p.el.html, /<div id="btyes" class="button focused"/);
    assert.match(p.el.html, /<div id="btno" class="button"/);
    vm.runInContext('window.PopupYes()', p.ctx);
    assert.deepEqual(p.published, [['aop/display/layers/popup/yesno/response', 'true']]);
});

test('sim/nao: display-name que fecha o span e abre botoes falsos nao vira markup', () => {
    const p = page();
    const name = '</span><div id="btyes" select="PopupNo">Sim</div><script>window.__injetado=1</script>';
    p.deliver(YESNO, open(askMessage(name), 10000));
    assert.equal((p.el.html.match(/id="btyes"/g) || []).length, 1, p.el.html);
    assert.ok(!p.el.html.includes('<script'), p.el.html);
    assert.ok(p.el.html.includes('&lt;/span&gt;&lt;div id=&quot;btyes&quot;'), p.el.html);
});

test('escape: & < > " e apostrofo viram entidades; texto comum fica igual', () => {
    const p = page();
    p.deliver(YESNO, open(askMessage(`Tom & "Jerry's" <b>`), 10000));
    assert.ok(p.el.html.includes('A aplicação &quot;Tom &amp; &quot;Jerry&#39;s&quot; &lt;b&gt;&quot; deseja acessar'), p.el.html);
    p.deliver(YESNO, open(askMessage('Meu App 2.0'), 10000));
    assert.ok(p.el.html.includes('<span class="text">A aplicação &quot;Meu App 2.0&quot; deseja acessar as informações do sinal de TV Digital.\nVocê deseja autorizar isto?</span>'), p.el.html);
});

test('PIN: valor com HTML entra escapado', () => {
    const p = page();
    p.deliver(PIN, open(INJECAO));
    assert.equal(p.el.visible, true);
    assert.ok(p.el.html.includes(`<span class="pin">${INJECAO_ESCAPADA}</span>`), p.el.html);
    assert.ok(!p.el.html.includes('<img'), p.el.html);
    p.deliver(PIN, open('0042'));
    assert.ok(p.el.html.includes('<span class="pin">0042</span>'), p.el.html);
});

test('QR code: o valor vai so para a biblioteca, como texto; o HTML do pop-up e o fixo', () => {
    const p = page();
    p.deliver(QR, open(`"></div>${INJECAO}`));
    assert.deepEqual(p.qrcodes.map(q => q.text), [`"></div>${INJECAO}`]);
    assert.equal(p.el.html, '<span class="text">Escaneie o QR code abaixo com seu dispositivo.</span>\n<div id="qrcode"></div>');
});

// --- informative notice (C.6.14.5) -------------------------------------------
// tv3ws publishes on popup/info {"value", "timeout": 5000}; the notice does
// not take another pop-up off the screen: it waits in a queue of 3.
const INFO = 'aop/display/layers/popup/info';
const aviso = (value, timeout = 5000) => JSON.stringify({ value, timeout });
const AVISO = 'A emissora urn:tv30:service:users-test atualizou os dados do perfil Viewer 1.';

test('aviso (info): texto na tela, fecha sozinho no prazo, sem botoes nem resposta', () => {
    const p = page();
    p.deliver(INFO, aviso(AVISO));
    assert.equal(p.el.visible, true);
    assert.equal(p.el.html, `<span class="text">${AVISO}</span>`);
    assert.equal(p.state().popup_type, 'info');
    assert.equal(p.state().yesno_popup, false, 'as teclas seguem para a pagina');
    assert.ok(!vm.runInContext('window.PopupYes', p.ctx), 'sem botao Sim');
    p.advance(4999);
    assert.equal(p.el.visible, true);
    p.advance(1);
    assert.equal(p.el.visible, false);
    assert.equal(p.state().has_popup, false);
    assert.deepEqual(p.published, [], 'o aviso nao publica resposta');
    assert.equal(p.timers.size, 0);
});

test('aviso (info): texto com HTML entra escapado', () => {
    const p = page();
    p.deliver(INFO, aviso(`A emissora <b>X</b> atualizou os dados do perfil ${INJECAO}.`));
    assert.ok(p.el.html.includes(`&lt;b&gt;X&lt;/b&gt;`), p.el.html);
    assert.ok(p.el.html.includes(INJECAO_ESCAPADA), p.el.html);
    assert.ok(!p.el.html.includes('<img') && !p.el.html.includes('<b>'), p.el.html);
});

test('aviso (info): prazo ausente, zero, negativo ou que nao e numero vira 5 s; {"close":true} nao o fecha', () => {
    for (const msg of ['{"value":"a"}', '{"value":"a","timeout":0}', '{"value":"a","timeout":-1}', '{"value":"a","timeout":"x"}', '{"value":"a","timeout":null}']) {
        const p = page();
        p.deliver(INFO, msg);
        p.deliver(INFO, CLOSE);
        p.advance(4999);
        assert.equal(p.el.visible, true, msg);
        p.advance(1);
        assert.equal(p.el.visible, false, msg);
    }
    const p = page();
    p.deliver(INFO, aviso('a', 12000));
    p.advance(11999);
    assert.equal(p.el.visible, true, 'prazo da mensagem respeitado');
});

test('aviso (info) com o sim/nao aberto: o sim/nao fica; o aviso aparece depois da resposta', () => {
    const p = page();
    p.deliver(YESNO, open('Autoriza?', 10000));
    p.deliver(INFO, aviso(AVISO));
    assert.equal(p.state().popup_type, 'yesno', 'o aviso nao tira o sim/nao da tela');
    assert.equal(p.state().yesno_popup, true);
    assert.match(p.el.html, /Autoriza\?/);
    p.advance(6000);
    assert.equal(p.state().popup_type, 'yesno');
    vm.runInContext('window.PopupYes()', p.ctx);
    assert.deepEqual(p.published, [['aop/display/layers/popup/yesno/response', 'true']]);
    assert.equal(p.state().popup_type, 'info', 'camada livre: o aviso aparece');
    assert.equal(p.el.html, `<span class="text">${AVISO}</span>`);
    assert.equal(p.state().yesno_popup, false);
    p.advance(5000);
    assert.equal(p.el.visible, false);
});

test('aviso (info) com o sim/nao aberto: o prazo do sim/nao responde false e o aviso aparece', () => {
    const p = page();
    p.deliver(YESNO, open('Autoriza?', 10000));
    p.deliver(INFO, aviso(AVISO));
    p.advance(10000);
    assert.deepEqual(p.published, [['aop/display/layers/popup/yesno/response', 'false']]);
    assert.equal(p.state().popup_type, 'info');
    p.advance(5000);
    assert.equal(p.el.visible, false);
});

test('aviso (info) com o QR code ou o PIN aberto: espera o fechamento ou o prazo da trava', () => {
    let p = page();
    p.deliver(QR, open('chave'));
    p.deliver(INFO, aviso(AVISO));
    assert.equal(p.state().popup_type, 'qrcode');
    assert.deepEqual(p.qrcodes.map(q => q.text), ['chave']);
    p.deliver(QR, CLOSE);
    assert.equal(p.state().popup_type, 'info');
    p.advance(5000);
    assert.equal(p.el.visible, false);

    p = page();
    p.deliver(PIN, open('0042'));
    p.deliver(INFO, aviso(AVISO));
    assert.equal(p.state().popup_type, 'pin');
    p.advance(PRAZO);
    assert.equal(p.state().popup_type, 'info', 'trava do PIN fechou: o aviso aparece');
    assert.match(p.el.html, /atualizou os dados do perfil/);
});

test('aviso (info) com outro aviso na tela: espera o prazo do primeiro', () => {
    const p = page();
    p.deliver(INFO, aviso('primeiro'));
    p.deliver(INFO, aviso('segundo'));
    assert.equal(p.el.html, '<span class="text">primeiro</span>');
    p.advance(5000);
    assert.equal(p.el.html, '<span class="text">segundo</span>');
    p.advance(5000);
    assert.equal(p.el.visible, false);
});

test('aviso (info): fila de 3; o excedente e descartado e logado', () => {
    const p = page();
    p.deliver(YESNO, open('Autoriza?', 60000));
    for (let i = 1; i <= 5; i++) p.deliver(INFO, aviso(`aviso ${i}`));
    assert.equal(p.state().popup_type, 'yesno');
    const descartes = p.warnings.filter(w => /aviso descartado \(fila cheia/.test(w));
    assert.equal(descartes.length, 2, p.warnings.join(' | '));
    assert.ok(descartes[0].includes('aviso 4') && descartes[1].includes('aviso 5'));
    vm.runInContext('window.PopupNo()', p.ctx);
    const shown = [];
    for (let i = 0; i < 5 && p.state().has_popup; i++) {
        shown.push(p.el.html);
        p.advance(5000);
    }
    assert.deepEqual(shown, [1, 2, 3].map(i => `<span class="text">aviso ${i}</span>`));
    assert.equal(p.el.visible, false);
});

test('aviso (info) na tela substituido pelo sim/nao, QR code ou PIN: volta para a fila e aparece inteiro depois', () => {
    const p = page();
    p.deliver(INFO, aviso(AVISO));
    p.advance(2000);
    p.deliver(YESNO, open('Autoriza?', 10000));
    assert.equal(p.state().popup_type, 'yesno', 'o novo substitui o da tela');
    p.advance(5000);
    assert.equal(p.state().popup_type, 'yesno', 'o prazo do aviso substituido nao fecha o sim/nao');
    vm.runInContext('window.PopupYes()', p.ctx);
    assert.equal(p.state().popup_type, 'info');
    assert.equal(p.el.html, `<span class="text">${AVISO}</span>`);
    p.advance(4999);
    assert.equal(p.el.visible, true, 'o aviso volta com o prazo inteiro');
    p.advance(1);
    assert.equal(p.el.visible, false);

    // The QR code also replaces; the notice comes back on closing.
    p.deliver(INFO, aviso('outro'));
    p.deliver(QR, open('chave'));
    assert.equal(p.state().popup_type, 'qrcode');
    p.deliver(QR, CLOSE);
    assert.equal(p.el.html, '<span class="text">outro</span>');
});
