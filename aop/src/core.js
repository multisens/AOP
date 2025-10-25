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
    rxgui: {
        current: '',
        previous: ''
    },
    currentUser: '',
    users: [],
    currentService: '',
    serviceList: []
};

const GUI = {
    app_catalogue: '/appcat',
    profile_chooser: '/prfchs',
    profile_creator: '/prfchs',
    bootstrap_app: '/appcat'
};

const _t = {
    current_user: 'aop/currentUser',
    current_service: 'aop/currentService',
    services: 'aop/services',
    gui_layer: 'aop/display/layers/rxgui'
};

const _topics = new Map([
  [_t.current_user, loadCurrentUser],
  [_t.current_service, loadCurrentService],
  [_t.services, loadServiceList]
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

function setDisplayGui(screen) {
    client.publish(_t.gui_layer, screen);
    DATA.rxgui.previous = DATA.rxgui.current;
    DATA.rxgui.current = screen;
}

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
    client.publish(_t.current_user, uid.toString(), { retain : true });
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

function getUserList() {
    return DATA.users;
}

function loadCurrentService(message) {
    DATA.currentService = message.toString();
}

function setCurrentService(sid) {
    DATA.currentService = sid.toString();
    client.publish(_t.current_service, sid.toString(), { retain : true });
}

function loadServiceList(message) {
	DATA.serviceList = JSON.parse(message);
}

function getServiceList() {
	return DATA.serviceList;
}


module.exports = {
    GUI,
    setDisplayGui,
    setCurrentUser,
    getCurrentUser,
    getUserData,
    getUserList,
    setCurrentService,
    getServiceList
}