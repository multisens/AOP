require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');

const client = mqtt.connect(`mqtt://${process.env.MQTT_HOST}`, {
    clientId : 'aop-core',
    clean : true,
    connectTimeout : 4000,
});

const DATA = {
    currentUser: '',
    users: [],
    serviceList: []
};

const _topics = new Map([
  ['aop/currentUser', loadCurrentUser],
  ['aop/services', loadServiceList]
]);

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    _topics.forEach((_, key) => {
      client.subscribe(key, { noLocal : true });
    });

    loadUserData();
});

client.on('message', (topic, message) => {
    if (_topics.has(topic)) {
        _topics.get(topic)(message.toString());
    }
    else {
        console.log(`no handler for topic ${topic}`);
    }
});

function loadUserData() {
    let userData = JSON.parse(fs.readFileSync(`${process.env.USER_DATA_PATH}/userData.json`));
    userData.users.forEach(usr => {
        DATA.users.push({
            id: usr.id,
            name: usr.name,
            avatar: usr.avatar
        });
    });

    setCurrentUser(DATA.users[0].id);
}

function loadCurrentUser(message) {
    DATA.currentUser = message.toString();
}

function setCurrentUser(uid) {
    DATA.currentUser = uid.toString();
    client.publish('aop/currentUser', uid.toString(), { retain : true });
}

function getCurrentUser() {
    return DATA.currentUser;
}

function getUserData(uid) {
    let result = {};
    DATA.users.forEach(usr => {
        if (usr.id == uid) {
            result = usr;
        }
    });
    return result;
}

function loadServiceList(message) {
	DATA.serviceList = JSON.parse(message);
}

function getServiceList() {
	return DATA.serviceList;
}


module.exports = {
    setCurrentUser,
    getCurrentUser,
    getUserData,
    getServiceList
}