const core = require('../../core');

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

function fullscreen() {
	core.setDisplayGui('');
	core.setVideoSize();
	try {
		startApp(core.getServiceSLS().bald);
	} catch (error) {
		core.setBALDHandler(startApp);
	}
}

function startApp(bald) {
	bald.forEach(entryPackage => {
		if (!entryPackage.controlCode || entryPackage.controlCode == 'AUTOSTART'){
			if (entryPackage.appType == 'TV30-Ginga-HTML5') {
				// just load it in the graphics layer
				core.setDisplayGraphics(entryPackage.bcastEntryPackageUrl, entryPackage.bcastEntryPointUrl);
			}
			else if (entryPackage.appType == 'TV30-Ginga-NCL') {
				// Serve the AOP-hosted NCL4 player into #graphics (INTEGRATION.md Part 3).
				//
				// Identifier mapping (BALD entryPackage -> player/engine, the bridge to Part 4):
				//   app_id     <- entryPackage.appId (the app's id within the service).
				//   service_id <- the current service. BALD entries carry no serviceId
				//     field (bcast/src/types.ts), so it comes from the service context
				//     the BALD belongs to. These are the ids the topic root
				//     aop/<service_id>/<app_id>/doc/# is built from, and must match the
				//     engine's launch target (its SERVICE_ID/APP_ID). In Part 3's static
				//     launch that match is configured; Part 4a makes it live.
				const serviceId = core.getCurrentService();
				const appId = entryPackage.appId;
				core.setDisplayNclPlayer(serviceId, appId);
			}
		}
	});
}


module.exports = {
	profile,
	openBootstrapApp,
	bootstrapAppData,
	esgData,
	closeBootstrapApp,
	fullscreen
}