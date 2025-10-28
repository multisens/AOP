const core = require('../../core');


function profile() {
	var usr = core.getUserData(core.getCurrentUser());
	var html = `<span>${usr.name}</span><img src="/${usr.avatar}"/>`;
	return html;
}

function openBootstrapApp() {
	let bam = core.getCurrentService().bam;
	if (bam.initialMediaURLs) {
		core.setVideoURL(bam.initialMediaURLs[0]);
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
			contentAdvisoryRatings: esg.Service.ContentAdvisoryRatings
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
}


module.exports = {
    profile,
	openBootstrapApp,
	bootstrapAppData,
	esgData,
	closeBootstrapApp,
	fullscreen
}