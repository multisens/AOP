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

const popup_types = ['yesno', 'qrcode', 'pin'];
// Pop-ups que o tv3ws fecha no fim do pareamento (C.4.3.2, C.4.3.3)
const closable_popup_types = ['qrcode', 'pin'];

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
    presentPopup(type, content.value, Number(content.timeout));
}

// Correcao de 12/10 (spec-1210-seguranca, item 3): texto que vem na mensagem
// MQTT entra no HTML do pop-up so escapado. Antes ia cru para o .html(): o
// display-name do /tv3/authorize (escolhido pelo cliente que pede acesso, e
// que o tv3ws poe na mensagem do sim/nao) era interpretado como HTML na tela
// da TV, inclusive com script (<img src=x onerror=...>), e o script podia
// chamar o "Sim" do proprio pop-up (PopupYes): o cliente se autorizava sem o
// espectador (medido no Chrome 154). O mesmo vale para o PIN. O QR code nao passa por aqui: a biblioteca o desenha a partir do texto
// (e o poe no title do elemento, como texto).
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function presentPopup(type, content, timeout) {
    console.log(`Pediu popup ${type}, com ${content}, por ${timeout}`);
    // pop-up novo substitui o da tela, com o prazo e os botoes dele
    if (has_popup) {
        ClosePopup();
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

        // trava de seguranca: o tv3ws manda fechar no fim do pareamento
        // (handlePopupMessage); se o cliente desistir, o prazo fecha
        popup_timer = setTimeout(() => {
            if (has_popup) {
                ClosePopup();
            }
        }, timeout);
    }
    $('#popup').show();
}

function ClosePopup() {
    clearTimeout(popup_timer);
    popup_timer = null;
    has_popup = false;
    popup_type = null;
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