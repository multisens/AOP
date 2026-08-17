const core = require('../../core');

// Default avatar (verde escuro pastel) quando user nao customizou.
// Mesma silhueta dos avatares custom — so muda a cor.
const DEFAULT_AVATAR_SVG =
    '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="100" height="100" rx="30" fill="#4d7c5b"/>' +
        '<circle cx="50" cy="40" r="14" fill="none" stroke="#ffffff" stroke-width="5"/>' +
        '<path d="M 14 90 a 36 36 0 0 1 72 0" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>' +
    '</svg>';

function avatarHtml(avatar) {
    if (!avatar) return DEFAULT_AVATAR_SVG;
    if (typeof avatar === 'string' && avatar.startsWith('<svg')) return avatar;
    return DEFAULT_AVATAR_SVG;
}


function cards() {
	var services = core.getServiceList();
	var cards_in_line = 4;
	var num = services.size;
	
	var html = '';
	var i = 0;
	services.forEach((lls, _) => {
		let move = `moveleft="${i % cards_in_line == 0 ? "menumenu" : "card"+(i-1)}"`;
		if (i % cards_in_line != cards_in_line - 1 && i + 1 < num) {
			move += ` moveright="card${i+1}"`;
		}
		if (i < cards_in_line) {
			move += ' moveup="profile"';
		}
		else {
			move += ` moveup="card${i - cards_in_line}"`;
		}
		if (i + cards_in_line < num) {
			move += ` movedown="card${i + cards_in_line}"`;
		}

		html += `<div id="card${i}" class="card" ${move} select="selectService" selectParam="${lls.bam.globalServiceId}">` +
					`<span>${lls.bam.appName}</span>` +
					`<div class="logo">${lls.bam.appIcon}</div>` +
				`</div>`;
		i++;
	});
	
	return html;
}


function profile() {
	var usr = core.getUserData(core.getCurrentUser());
	var html = `<span>${usr.name || ''}</span>${avatarHtml(usr.avatar)}`;
	return html;
}


module.exports = {
    cards,
	profile
}