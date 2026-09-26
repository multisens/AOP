require('dotenv').config();
const core = require('../../../core');
// Avatar padrao: fonte unica no gestor de perfis (M1)
const { avatarHtml } = require('../avatar');


function cards() {
	var usr = core.getUserList();
	var num = usr.length;

	var html = '';
	for(i = 0; i < num; i++) {
		let left = `card${i-1 >= 0 ? i-1 : "new"}`;
		let right = `card${i+1 < num ? i+1 : "new"}`;

		html += `<div id="card${i}" class="card" moveleft="${left}" moveright="${right}" select="selectProfile" selectParam="${usr[i].id}">` +
                    avatarHtml(usr[i].avatar) +
                    `<span>${usr[i].name}</span>` +
                '</div>';
	}

	let move = '';
	if (num > 0) {
		move = `moveleft="card${num-1}" moveright="card0"`;
	}
	const NEW_AVATAR_SVG =
		'<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
			'<rect width="100" height="100" rx="30" fill="#2a2a5a"/>' +
			'<line x1="30" y1="50" x2="70" y2="50" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>' +
			'<line x1="50" y1="30" x2="50" y2="70" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>' +
		'</svg>';
	html += `<div id="cardnew" class="card focused" ${move} select="createProfile">` +
				NEW_AVATAR_SVG +
				'<span>Create new<br/>profile</span>' +
			'</div>';
	
	return html;
}


module.exports = {
    cards
}