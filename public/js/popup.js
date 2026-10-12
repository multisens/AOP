let has_popup = false;
let yesno_popup = false;
// Tipo do pop-up na tela ('yesno', 'qrcode' ou 'pin') e o prazo dele.
// Correcao de 12/10 (spec-1210-defeitos, item 1): o QR code e o PIN do
// pareamento ficam ate 120 s na tela (tv3ws/src/api/client-identification/
// service.ts, PAIRING_POPUP_TIMEOUT_MS). Com prazo longo, o setTimeout de um
// pop-up que ja saiu fecharia o pop-up seguinte; por isso o prazo e um so, do
// pop-up na tela, e e cancelado quando ele fecha ou e substituido.
let popup_type = null;
let popup_timer = null;

const popup_types = ['yesno', 'qrcode', 'pin', 'info'];
// Pop-ups que o tv3ws fecha no fim do pareamento (C.4.3.2, C.4.3.3)
const closable_popup_types = ['qrcode', 'pin'];

// G9 (decisao do Luis em 12/10): aviso informativo ('info', topico
// aop/display/layers/popup/info, {"value": <texto>, "timeout": <ms>}) que o
// tv3ws publica depois de gravar atributos de emissora do perfil (C.6.14.5,
// Tabela C.72, p. 332; p. 350 do PDF: "it is necessary to notify the user
// that the application wants to change/add the attribute"). Nao pede
// resposta, fecha sozinho no prazo e nao tira da tela um sim/nao, QR code ou
// PIN aberto (a camada grafica tem um pop-up so, G2): com qualquer pop-up na
// tela, o aviso espera numa fila curta e aparece quando a camada fica livre.
// Fila cheia: o aviso novo e descartado (console). Aviso na tela que um
// sim/nao, QR code ou PIN substitui volta para o comeco da fila e aparece
// inteiro depois.
// PENDENTE (Joel): G2 (fila de pop-ups) continua aberto para os outros tipos;
// esta fila vale so para o aviso.
const INFO_QUEUE_MAX = 3;
const INFO_DEFAULT_TIMEOUT = 5000;
const info_queue = [];
// texto do aviso na tela (para voltar a fila se for substituido)
let info_on_screen = null;

// Mensagem MQTT de pop-up (aop/display/layers/popup/<tipo> e
// .../popup/<tipo>/message), repassada por mqtt_message (view.ejs).
// Correcao de 12/10 (spec-1210-defeitos, item 1):
// - {"close":true} no topico do QR code ou do PIN e o fim do pareamento
//   (C.4.3.2: "When this stream ends, the pop-up with the QR code is removed
//   from the receiver screen"; C.4.3.3: "the pop-ups for filling out the PIN
//   are removed from both the non-local client's screen and the TV 3.0
//   receiver"; quem publica e o tv3ws, src/core.ts): fecha o pop-up aberto
//   daquele tipo. Com pop-up de outro tipo na tela, ou sem pop-up, nada muda;
// - mensagem invalida (JSON quebrado, nao objeto, sem "value" de texto, tipo
//   desconhecido) vai para o console e e ignorada. Antes o JSON.parse ficava
//   em mqtt_message e lancava dentro do tratador de mensagens do MQTT.
function handlePopupMessage(type, raw) {
    let content;
    try {
        content = JSON.parse(raw);
    } catch (err) {
        console.warn(`Pop-up ${type}: mensagem ignorada (JSON invalido): ${raw}`);
        return;
    }
    if (content === null || typeof content !== 'object' || Array.isArray(content)) {
        console.warn(`Pop-up ${type}: mensagem ignorada (nao e objeto JSON): ${raw}`);
        return;
    }
    if (content.close === true) {
        if (closable_popup_types.includes(type) && has_popup && popup_type == type) {
            ClosePopup();
        }
        return;
    }
    if (!popup_types.includes(type) || typeof content.value !== 'string') {
        console.warn(`Pop-up ${type}: mensagem ignorada (tipo desconhecido ou sem "value"): ${raw}`);
        return;
    }
    if (type == 'info') {
        enqueueInfo(content.value, Number(content.timeout));
        return;
    }
    presentPopup(type, content.value, Number(content.timeout));
}

// G9: o aviso aparece ja se a camada estiver livre; senao, espera na fila.
// Prazo ausente, zero, negativo ou que nao e numero: 5 s.
function enqueueInfo(text, timeout) {
    const ms = Number.isFinite(timeout) && timeout > 0 ? timeout : INFO_DEFAULT_TIMEOUT;
    if (!has_popup) {
        presentPopup('info', text, ms);
        return;
    }
    if (info_queue.length >= INFO_QUEUE_MAX) {
        console.warn(`Pop-up info: aviso descartado (fila cheia, ${INFO_QUEUE_MAX} esperando): ${text}`);
        return;
    }
    info_queue.push({ text, timeout: ms });
}

// camada livre: o proximo aviso da fila, se houver
function showNextInfo() {
    if (has_popup || info_queue.length == 0) return;
    const next = info_queue.shift();
    presentPopup('info', next.text, next.timeout);
}

// Correcao de 12/10 (spec-1210-seguranca, item 3): texto que vem na mensagem
// MQTT entra no HTML do pop-up so escapado. Antes ia cru para o .html(): o
// display-name do /tv3/authorize (escolhido pelo cliente que pede acesso, e
// que o tv3ws poe na mensagem do sim/nao) era interpretado como HTML na tela
// da TV, inclusive com script (<img src=x onerror=...>), e o script podia
// chamar o "Sim" do proprio pop-up (PopupYes): o cliente se autorizava sem o
// espectador (medido no Chrome 154). O mesmo vale para o PIN e, desde G9
// (decisao do Luis em 12/10), para o aviso (info), que traz o apelido do
// perfil e o nome do servico. O QR code nao passa por aqui: a biblioteca o desenha a partir do texto
// (e o poe no title do elemento, como texto).
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function presentPopup(type, content, timeout) {
    console.log(`Pediu popup ${type}, com ${content}, por ${timeout}`);
    // pop-up novo substitui o da tela, com o prazo e os botoes dele (o aviso
    // nunca chega aqui com pop-up na tela: espera na fila, enqueueInfo). Aviso
    // substituido volta para o comeco da fila (G9).
    if (has_popup) {
        if (popup_type == 'info' && info_on_screen) {
            info_queue.unshift(info_on_screen);
        }
        hidePopup();
    }
    has_popup = true;
    popup_type = type;

    if (type == 'yesno') {
        yesno_popup = true;
        $('#popup').html(`<span class="text">${escapeHtml(content)}</span>\n` +
                        '<div class="buttons">\n' +
                            '<div id="btyes" class="button focused" moveleft="btno" moveright="btno" select="PopupYes">Sim</div>\n' +
                            '<div id="btno" class="button" moveleft="btyes" moveright="btyes" select="PopupNo">Não</div>\n' +
                        '</div>');
        $('#popup').height('25%');

        popup_timer = setTimeout(() => {
            if (has_popup) {
                yesno_popup = false;
                ClosePopup();
                publishTopic('aop/display/layers/popup/yesno/response', 'false');
            }
        }, timeout);

        window.PopupYes = () => {
            ClosePopup();
            publishTopic('aop/display/layers/popup/yesno/response', 'true');
        }

        window.PopupNo = () => {
            ClosePopup();
            publishTopic('aop/display/layers/popup/yesno/response', 'false');
        }
    }
    else {
        if (type == 'pin') {
            $('#popup').html('<span class="text">Digite o pin a seguir no seu dispositivo.</span>\n' +
                            `<span class="pin">${escapeHtml(content)}</span>`);
            $('#popup').height('25%');
        }
        else if (type == 'qrcode') {
            $('#popup').html('<span class="text">Escaneie o QR code abaixo com seu dispositivo.</span>\n' +
                            `<div id="qrcode"></div>`);
            new QRCode(document.getElementById('qrcode'), {
                text: content,
                width: 128,
                height: 128,
                colorDark: "rgb(40, 40, 40)",
                colorLight: "rgb(200, 200, 200)",
            });
            $('#popup').height('40%');
        }
        else if (type == 'info') {
            // G9: so o texto, escapado; sem botoes (as teclas seguem para a
            // pagina: yesno_popup fica falso)
            info_on_screen = { text: content, timeout };
            $('#popup').html(`<span class="text">${escapeHtml(content)}</span>`);
            $('#popup').height('20%');
        }

        // trava de seguranca: o tv3ws manda fechar no fim do pareamento
        // (handlePopupMessage); se o cliente desistir, o prazo fecha. O aviso
        // (info) fecha so por aqui.
        popup_timer = setTimeout(() => {
            if (has_popup) {
                ClosePopup();
            }
        }, timeout);
    }
    $('#popup').show();
}

// Fecha o pop-up da tela; com a camada livre, aparece o proximo aviso da fila
// (G9)
function ClosePopup() {
    hidePopup();
    showNextInfo();
}

// Tira o pop-up da tela sem olhar a fila (substituicao, presentPopup)
function hidePopup() {
    clearTimeout(popup_timer);
    popup_timer = null;
    has_popup = false;
    popup_type = null;
    info_on_screen = null;
    // (12/10) as teclas voltam a seguir para a pagina: antes so o prazo do
    // sim/nao zerava esta marca, e depois de "Sim"/"Nao" (ou de um QR code ou
    // PIN aberto por cima do sim/nao) relay_key (view.ejs) seguia mandando
    // toda tecla para os botoes de um pop-up que ja tinha saido
    yesno_popup = false;
    $('#popup').hide();
    $('#popup').html('');
    window.PopupYes = null;
    window.PopupNo = null;
}