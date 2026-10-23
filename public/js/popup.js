let has_popup = false;
let yesno_popup = false;
// Tipo do pop-up na tela e o prazo dele, um so, cancelado quando o pop-up fecha
// ou e substituido: QR code e PIN ficam no maximo 120 s (tv3ws,
// PAIRING_POPUP_TIMEOUT_MS), e o prazo de um que ja saiu fecharia o seguinte.
let popup_type = null;
let popup_timer = null;

const popup_types = ['yesno', 'qrcode', 'pin', 'info'];
// Pop-ups que o tv3ws fecha no fim do pareamento (C.4.3.2, C.4.3.3)
const closable_popup_types = ['qrcode', 'pin'];

// Aviso (popup/info, {"value", "timeout"}) que o tv3ws publica ao gravar
// atributos de emissora do perfil (C.6.14.5, Tabela C.74): sem resposta, fecha
// no prazo e nao tira outro pop-up da tela; espera numa fila curta (cheia:
// descartado). So o aviso tem fila; aviso substituido volta ao comeco dela.
const INFO_QUEUE_MAX = 3;
const INFO_DEFAULT_TIMEOUT = 5000;
const info_queue = [];
// texto do aviso na tela (para voltar a fila se for substituido)
let info_on_screen = null;

// Mensagem de aop/display/layers/popup/<tipo>[/message], repassada por
// mqtt_message (view.ejs). {"close":true} no QR code ou no PIN e o fim do
// pareamento (C.4.3.2, C.4.3.3): fecha o pop-up aberto daquele tipo, e so ele.
// Mensagem invalida vai para o console e e ignorada.
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

function showNextInfo() {
    if (has_popup || info_queue.length == 0) return;
    const next = info_queue.shift();
    presentPopup('info', next.text, next.timeout);
}

// Texto da mensagem MQTT so entra escapado no HTML do pop-up: o display-name do
// /tv3/authorize, escolhido pelo cliente, poderia rodar script que chamasse o
// PopupYes e autorizasse o cliente sem o espectador. O QR code nao passa por
// aqui: a biblioteca o desenha a partir do texto.
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function presentPopup(type, content, timeout) {
    console.log(`Pediu popup ${type}, com ${content}, por ${timeout}`);
    // pop-up novo substitui o da tela (o aviso so chega aqui com a camada
    // livre); aviso substituido volta ao comeco da fila
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
            // so o texto, escapado; sem botoes (as teclas seguem para a
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
    // as teclas voltam para a pagina (relay_key, view.ejs) qualquer que seja o
    // pop-up que saiu
    yesno_popup = false;
    $('#popup').hide();
    $('#popup').html('');
    window.PopupYes = null;
    window.PopupNo = null;
}