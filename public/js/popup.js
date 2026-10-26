let has_popup = false;
let yesno_popup = false;
// Type of the pop-up on screen and its deadline, a single one, canceled when
// the pop-up closes or is replaced: the deadline of one that already left
// would close the next one.
let popup_type = null;
let popup_timer = null;

const popup_types = ['yesno', 'qrcode', 'pin', 'info'];
// Pop-ups closed by a close message at the end of the pairing (C.4.3.2,
// C.4.3.3).
const closable_popup_types = ['qrcode', 'pin'];

// Notice (popup/info, {"value", "timeout"}) of a write of broadcaster
// attributes of the profile (C.6.14.5, Table C.74): without an answer, it
// closes at its deadline and does not take another pop-up off the screen; it
// waits in a short queue (full: discarded). Only the notice has a queue; a
// replaced notice goes back to its start.
const INFO_QUEUE_MAX = 3;
const INFO_DEFAULT_TIMEOUT = 5000;
const info_queue = [];
// Text of the notice on screen (to go back to the queue if replaced).
let info_on_screen = null;

// Message of aop/display/layers/popup/<type>[/message], passed on by
// mqtt_message (view.ejs). {"close":true} on the QR code or the PIN is the
// end of the pairing (C.4.3.2, C.4.3.3): closes the open pop-up of that type,
// and only it. An invalid message goes to the console and is ignored.
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

// The text of the MQTT message enters the HTML of the pop-up only escaped:
// the display-name of /tv3/authorize, chosen by the client, could run a
// script that called PopupYes and authorized the client without the viewer.
// The QR code does not pass here: the library draws it from the text.
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function presentPopup(type, content, timeout) {
    console.log(`Pediu popup ${type}, com ${content}, por ${timeout}`);
    // A new pop-up replaces the one on screen (the notice only gets here with
    // the layer free); a replaced notice goes back to the start of the queue.
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
            // Only the text, escaped; no buttons (the keys go on to the page:
            // yesno_popup stays false).
            info_on_screen = { text: content, timeout };
            $('#popup').html(`<span class="text">${escapeHtml(content)}</span>`);
            $('#popup').height('20%');
        }

        // Safety lock: a close message ends the pairing (handlePopupMessage);
        // if the client gives up, the deadline closes it. The notice (info)
        // closes only here.
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

// Takes the pop-up off the screen without looking at the queue
// (replacement, presentPopup).
function hidePopup() {
    clearTimeout(popup_timer);
    popup_timer = null;
    has_popup = false;
    popup_type = null;
    info_on_screen = null;
    // The keys go back to the page (relay_key, view.ejs) whatever pop-up left.
    yesno_popup = false;
    $('#popup').hide();
    $('#popup').html('');
    window.PopupYes = null;
    window.PopupNo = null;
}