const core = require('../../core');
// Avatar padrao: fonte unica no gestor de perfis (M1)
const { avatarHtml } = require('../profile-manager/avatar');
// escape e icone SVG como imagem (correcao de 12/10, spec-1210-seguranca2,
// item 2; ver ../../html.js)
const { escapeHtml, svgImageHtml, cssHexColor } = require('../../html');

// Cores da view (view.ejs, <style>) — correcao de 12/10, spec-1210-defeitos3,
// item 4: backgroundColor e foregroundColor do BAM e a cor do genero do ESG
// entravam no <style> so com o escape de HTML, que nao impede CSS
// ("red; } body { background: url(...) }" reescrevia a tela). Agora so passa
// o formato; fora dele, o padrao da view.
// - BAM, Tabela 6 (p. 54; p. 72 do PDF): "Hexadecimal RGB color code with
//   notation using a leading number sign (#)", EXAMPLE "#00FFFF" -> #RRGGBB
//   (a tabela nao fala em alpha nem na forma curta #RGB);
// - padrao: a paleta das outras telas do AoP (fundo rgb(40, 40, 40), texto
//   rgb(200, 200, 200): application-catalog/view.ejs), a mesma do BAM das
//   amostras do bcast; o genero, sem cor (transparente), como ja ficava sem
//   ESG.
// PENDENTE (Joel): a cor do genero (esg.Service.Genre.color) nao esta na
// ABNT NBR 25608 (nenhuma tabela dela define o campo); aceita-se #RRGGBB e
// #RRGGBBAA, o formato que o bcast publica hoje ("#07812cff").
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
	
	// appIconHtml: o appIcon do BAM (SVG da emissora) como <img> com URL
	// data:, que a view exibe com <%- %>; antes, o SVG ia em linha e o script
	// dele rodava (12/10, spec-1210-seguranca2 item 2). Os demais campos vao
	// para <%= %>, que escapa.
	return {
		appName: bam.appName,
		appIconHtml: svgImageHtml(bam.appIcon, { alt: '' }),
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