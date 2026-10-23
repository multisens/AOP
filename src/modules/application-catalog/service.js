const core = require('../../core');
const lls = require('../transport-layer-metadata-lls');
const { avatarHtml } = require('../profile-manager/avatar');
// appName, appIcon e globalServiceId (BAM da emissora) e nickname (POST
// /profile/create) vao escapados: a view exibe este HTML com <%- %>
const { escapeHtml, svgImageHtml } = require('../../html');


// os servicos anunciados, da unidade dona da lista; falha do Redis rejeita
async function cards() {
	var services = await lls.services();
	var cards_in_line = 4;
	var num = services.length;

	var html = '';
	var i = 0;
	services.forEach(svc => {
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
		if (i + cards_in_line <= num) {
			move += ` movedown="app${i + cards_in_line}"`;
		}

		html += `<div id="card${i}" class="card" ${move} select="selectService" selectParam="${escapeHtml(svc.bam.globalServiceId)}">` +
					`<span>${escapeHtml(svc.bam.appName)}</span>` +
					`<div class="logo">${svgImageHtml(svc.bam.appIcon, { alt: '' }, `appIcon do BAM de ${svc.bam.globalServiceId}`)}</div>` +
				`</div>`;
		i++;
	});
	
	return html;
}


function profile() {
	var usr = core.getUserData(core.getCurrentUser());
	var html = `<span>${escapeHtml(usr.name || '')}</span>${avatarHtml(usr.avatar)}`;
	return html;
}


module.exports = {
    cards,
	profile
}