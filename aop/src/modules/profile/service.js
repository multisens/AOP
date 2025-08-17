require('dotenv').config();
const ejs = require('ejs');
const fs = require('fs');
const mqttClient = require('../../mqtt-client');

const DATA = {
	screenWidth: process.env.SCREENWIDTH,
	users: []
}

let userData = JSON.parse(fs.readFileSync(`${process.env.USER_DATA_PATH}/userData.json`));
userData.users.forEach(usr => {
	DATA.users.push({
		id: usr.id,
		name: usr.name,
		avatar: usr.avatar
	});
});

mqttClient.publish(mqttClient.TOPIC.users, process.env.USER_DATA_PATH);
mqttClient.publish(mqttClient.TOPIC.current_user, DATA.users[0].id);



async function content(views, prev) {
	return await ejs.renderFile(`${views}/profile.ejs`,
		{
			showback: prev != 'load',
			content: await cards(views)
		});
}


async function cards(views) {
	var card_width = 220;
	var card_space_factor = 1.2;
	var num = DATA.users.length;

	var all_cards = num * card_width * card_space_factor + card_width;
	var left = 100 * (1 - all_cards/DATA.screenWidth)/2;
	var delta = 100 * card_width * card_space_factor/DATA.screenWidth;

	var html = '';
	for(i = 0; i < num; i++) {
		let p = await ejs.renderFile(`${views}/profile-card.ejs`,
			{
				id: `profile${i}`,
				width: `${card_width}px`,
				left: `${left + i*delta}%`,
				focus: `moveleft="profile${i-1 >= 0 ? i-1 : num}" moveright="profile${i+1}" select="setUser${i}"`,
				img: DATA.users[i].avatar,
				name: DATA.users[i].name
			});
		html += p.toString();
	}

	let p = await ejs.renderFile(`${views}/profile-card.ejs`,
		{
			id: `profile${num}`,
			width: `${card_width}px`,
			left: `${left + num*delta}%`,
			focus: `moveleft="profile${num-1}" moveright="profile0" select="create"`,
			img: 'new.png',
			name: 'Create new<br/>profile'
		});
	html += p.toString();
	
	return html;
}


function script(prev) {
	var js = `setUserData(${JSON.stringify(DATA.users)});\n`;

	for(i = 0; i < DATA.users.length; i++) {
		js += `function setUser${i}() {\n\t`;
		js += 	`chooseCurrentUser('${i}');\n\t`;
		js += 	'back()\n';
		js += '}\n';
	}

	js += 'function back() {\n\t';
	if (prev != 'load') {
		js += `loadNextPage('${prev}', 'profile');\n`;
	}
	else {
		js += `loadNextPage('dtv', 'profile');\n`;
	}
	js += '}';

	return js;
}


module.exports = {
    content,
	script
}