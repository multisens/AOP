const core = require('../../core');
// Avatar padrao: fonte unica no gestor de perfis (M1)
const { avatarHtml } = require('../profile-manager/avatar');


function profile() {
	var usr = core.getUserData(core.getCurrentUser());
	var html = `<span>${usr.name || ''}</span>${avatarHtml(usr.avatar)}`;
	return html;
}

function openBootstrapApp(mode) {
	if (mode != 'info') {
		let bam = core.getCurrentService().bam;
		if (bam.initialMediaURLs) {
			core.setVideoURL(bam.initialMediaURLs[0]);
		}
	}
	core.setVideoSize('12%', '35%', '60%', '60%');
}

function bootstrapAppData() {
	let bam = core.getCurrentService().bam;
	
	return {
		appName: bam.appName,
		appIcon: bam.appIcon,
		appDescription: bam.appDescription || '',
		backgroundColor: bam.backgroundColor,
		foregroundColor: bam.foregroundColor
	};
}

function esgData() {
	let esg = {}
	try {
		let esg = core.getServiceSLS().esg;

		return {
			validFrom: esg.Service.validFrom,
			validTo: esg.Service.validTo,
			contentName: esg.Service.Name.text,
			contentDescription: esg.Service.Description.text,
			genreColor: esg.Service.Genre.color,
			genreTerm: esg.Service.Genre.term,
			contentAdvisoryRatings: `media/rating/${esg.Service.ContentAdvisoryRatings}.png`
		}
	} catch (error) {
		return {
			validFrom: '',
			validTo: '',
			contentName: '',
			contentDescription: '',
			genreColor: '',
			genreTerm: '',
			contentAdvisoryRatings: ''
		}
	}
}

function closeBootstrapApp(gui) {
	core.setDisplayGui(gui);
	core.setVideoURL();
	core.setVideoSize();
	core.unsetCurrentService();
}

// Devolve a promessa do registro da origem associada (D-0510-6). Sem BALD
// ainda, o inicio fica para o handler (MQTT), que loga a falha.
function fullscreen() {
	core.setDisplayGui('');
	core.setVideoSize();
	try {
		return startApp(core.getServiceSLS().bald);
	} catch (error) {
		core.setBALDHandler(bald => {
			startApp(bald).catch(err => console.error(`[origins] falha registrando a origem da aplicacao: ${err.message}`));
		});
		return Promise.resolve();
	}
}

function startApp(bald) {
	const pending = [];
	bald.forEach(entryPackage => {
		if (!entryPackage.controlCode || entryPackage.controlCode == 'AUTOSTART'){
			if (entryPackage.appType == 'TV30-Ginga-HTML5') {
				// just load it in the graphics layer
				// (P1.3: na origem propria da aplicacao; o rotulo do host sai do appId)
				pending.push(core.setDisplayGraphics(entryPackage.bcastEntryPackageUrl, entryPackage.bcastEntryPointUrl, entryPackage.appId));
			}
			else if (entryPackage.appType == 'TV30-Ginga-NCL') {
				// todo: use ncl component
			}
		}
	});
	return Promise.all(pending);
}


module.exports = {
	profile,
	openBootstrapApp,
	bootstrapAppData,
	esgData,
	closeBootstrapApp,
	fullscreen
}