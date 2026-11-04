const core = require('../../core');
const { avatarHtml } = require('../profile-manager/avatar');
const { escapeHtml, svgImageHtml, cssHexColor } = require('../../html');

// Colors of the <style> of the view: only the format passes (cssHexColor);
// outside it, the palette of the other AoP screens. BAM, Table 6:
// "Hexadecimal RGB color code with notation using a leading number sign (#)",
// so #RRGGBB. The genre color, a field of the provisional SLS format of the
// testbed: #RRGGBB or #RRGGBBAA.
const DEFAULT_BACKGROUND_COLOR = '#282828';
const DEFAULT_FOREGROUND_COLOR = '#c8c8c8';
const DEFAULT_GENRE_COLOR = 'transparent';


function profile() {
	var usr = core.getUserData(core.getCurrentUser());
	var html = `<span>${escapeHtml(usr.name || '')}</span>${avatarHtml(usr.avatar)}`;
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
	
	// appIconHtml (<img> with a data: URL) goes to <%- %>; the other fields to
	// <%= %>, which escapes.
	return {
		appName: bam.appName,
		appIconHtml: svgImageHtml(bam.appIcon, { alt: '' }, `appIcon do BAM de ${bam.globalServiceId}`),
		appDescription: bam.appDescription || '',
		backgroundColor: cssHexColor(bam.backgroundColor, DEFAULT_BACKGROUND_COLOR),
		foregroundColor: cssHexColor(bam.foregroundColor, DEFAULT_FOREGROUND_COLOR)
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
			genreColor: cssHexColor(esg.Service.Genre.color, DEFAULT_GENRE_COLOR, { alpha: true }),
			genreTerm: esg.Service.Genre.term,
			contentAdvisoryRatings: `media/rating/${esg.Service.ContentAdvisoryRatings}.png`
		}
	} catch (error) {
		return {
			validFrom: '',
			validTo: '',
			contentName: '',
			contentDescription: '',
			genreColor: DEFAULT_GENRE_COLOR,
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

// Returns the promise of the registration of the associated origin. Without
// a BALD yet, the start is left to the MQTT handler, which logs a failure.
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
				pending.push(core.setDisplayGraphics(entryPackage.bcastEntryPackageUrl, entryPackage.bcastEntryPointUrl, entryPackage.appId));
			}
			else if (entryPackage.appType == 'TV30-Ginga-NCL') {
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