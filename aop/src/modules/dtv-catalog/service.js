const ejs = require('ejs');
const mqttClient = require('../../mqtt-client');

const DATA = {
	services: []
}


function loadServiceData(services) {
	DATA.services = JSON.parse(services);
}

mqttClient.addTopicHandler(mqttClient.TOPIC.services, loadServiceData);


async function content(views) {
	return await ejs.renderFile(`${views}/dtv-catalog.ejs`,
		{
			movedown: 'app0',
			moveleft: 'app0',
			content: await cards(views)
		});
}


async function cards(views) {
	var card_size = 13;
	var card_space_h = 3;
	var card_space_v = 3;
	var first_top = 20;
	var first_left = 22;
	var cards_in_line = 5;
	var num = DATA.services.length;

	var html = '';
	var line = 0;
	var column = 0;
	for(i = 0; i < num; i++) {
		let move = `moveleft="app${i-1 >= 0 ? DATA.services[i-1].serviceId : DATA.services[num-1].serviceId}"`;
		move += ` moveright="app${i+1 < num ? DATA.services[i+1].serviceId : DATA.services[0].serviceId}"`;
		if (line == 0) {
			move += ' moveup="user"';
		}
		else {
			move += ` moveup="app${DATA.services[i - cards_in_line].serviceId}"`;
		}
		if (i + cards_in_line <= num) {
			move += ` movedown="app${DATA.services[i + cards_in_line].serviceId}"`;
		}

		let p = await ejs.renderFile(`${views}/app-card.ejs`,
			{
				id: `app${DATA.services[i].serviceId}`,
				name: DATA.services[i].serviceName,
				top: `${first_top + (card_size + card_space_v) * line}%`,
				left: `${first_left + (card_size + card_space_h) * column}%`,
				focus: `${move} select="setApp${DATA.services[i].serviceId}"`,
				logo: DATA.services[i].serviceIcon
			});
		html += p.toString();
		column++;
		if (column+1 == cards_in_line) {
			column = 0;
			line++;
		}
	}
	
	return html;
}


function script(prev) {
	var js = "postFrameMessage({ type: 'loaded' })\n";

	for(i = 0; i < DATA.services.length; i++) {
		js += `function setApp${DATA.services[i].serviceId}() {\n\t`;
		js += 	`chooseCurrentService(${DATA.services[i].serviceId});\n\t`;
		js += 	`window.location.href = '${DATA.services[i].initialMediaURL}';\n`;
		js += '}\n';
	}

	js += `function openProfile() {\n\tloadNextPage('profile', 'dtv');\n}\n`;

	return js;
}


module.exports = {
    content,
	script
}