require('dotenv').config();
const fs = require('fs');
const mqtt = require('mqtt');
const redis = require('./redis-client');
const redisFunctions = require('./redis-functions');
const { whenReady } = require('./redis-options');
const profiles = require('./modules/profile-manager/service');
const lls = require('./modules/transport-layer-metadata-lls');
const appHosts = require('./app-hosts');

// Own origin of each application (./app-hosts.js), already validated.
const APPS = appHosts.appsConfig();

// origins:associated: origin of the running application (the one the
// browser sends in the Origin of its calls, not the proxy target) to the
// current globalServiceId. Cleared at boot.
const ORIGINS_KEY = 'origins:associated';
whenReady(redis, `limpeza de ${ORIGINS_KEY}`, () => redisFunctions.originsClear());

function registerAssociatedOrigin(origin) {
    const scid = DATA.currentService;
    if (!scid) return Promise.reject(new Error(`sem servico corrente: a origem ${origin} nao foi registrada como associada`));
    return redisFunctions.originRegister(origin, scid).then(() => origin);
}

function unregisterAssociatedOrigin(origin) {
    return redisFunctions.originRemove(origin).then(() => undefined);
}

const client = mqtt.connect(`mqtt://${process.env.MQTT_HOST}`, {
    clientId : 'aop-core',
    clean : true,
    connectTimeout : 4000,
});
lls.start((topic, message) => client.publish(topic, message, { retain : true }));

const DATA = {
    rxgui: {
        current: '',
        previous: ''
    },
    // Application in the graphics layer: { appId, label, origin, target } or
    // null.
    graphicsApp: null,
    videoStreamURL: '',
    currentUser: '',
    users: [],
    currentService: '',
    serviceMetadata: {}
};

const GUI = {
    app_catalogue: '/appcat',
    profile_chooser: '/prfchs',
    profile_creator: '/profile/create',
    bootstrap_app: '/btpapp'
};

const _t = {
    current_user: 'aop/currentUser',
    removed_user: 'aop/removedUser',
    current_service: 'aop/currentService',
    sls_metadata: 'tlm/sls/+/#',
    gui_layer: 'aop/display/layers/rxgui',
    pmplayer_url : 'aop/display/layers/video/url',
    pmplayer_size : 'aop/display/layers/video/size',
    graphics_layer: 'aop/display/layers/graphics',
    application_state: 'aop/application-lifecycle-manager/application-state'
};

const _topics = new Map([
    [_t.current_user, loadCurrentUser],
    [_t.current_service, loadCurrentService],
    [lls.TOPIC, lls.receive]
]);

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    _topics.forEach((_, key) => {
        client.subscribe(key, { noLocal : true });
    });

    // Additional topics to handle, but no subscribe yet
    _topics.set(_t.sls_metadata, loadSLSMetadata);

    loadUserData();
});

function mqttTopicMatch(topic, filter) {
    let filterregex = filter.split('/').map(level => {
        if (level === '+') {
            return '[^/#+]+';
        } else if (level === '#') {
            return '.*';
        } else {
            return level.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }).join('/');

    let regex = new RegExp(`^${filterregex}$`);
    return regex.test(topic);
}

client.on('message', (topic, message) => {
    let found = false;
    _topics.forEach((handler, filter) => {
        if (mqttTopicMatch(topic, filter)) {
            handler(message.toString(), topic);
            found = true;
            return;
        }
    });

    if (!found) {
        console.log(`no handler for topic ${topic}`);
    }
});

function setDisplayGui(screen) {
    client.publish(_t.gui_layer, screen);
    DATA.rxgui.previous = DATA.rxgui.current;
    DATA.rxgui.current = screen;
}

// baseUrl = bcastEntryPackageUrl (proxy target), epUrl = bcastEntryPointUrl,
// appId = appId of the BALD (host label; without it, the current service).
// Without baseUrl, ends the application. Publishes at once; the promise is
// the one of the registration.
function setDisplayGraphics(baseUrl = '', epUrl = '', appId = '') {
    let next = null;
    if (baseUrl !== '') {
        next = appHosts.describeApp(appId || DATA.currentService, baseUrl, APPS);
        if (!next) console.error(`[apps] bcastEntryPackageUrl invalido, aplicacao nao aberta: '${baseUrl}'`);
    }

    const pending = [];
    const prev = DATA.graphicsApp;
    if (prev && (!next || prev.origin !== next.origin)) {
        pending.push(unregisterAssociatedOrigin(prev.origin));
    }
    if (next) {
        pending.push(registerAssociatedOrigin(next.origin));
    }

    // The application that leaves ends before the one that enters starts.
    if (prev) {
        publishApplicationState(prev, 'ended');
    }
    DATA.graphicsApp = next ? { ...next, serviceContextId: DATA.currentService } : null;
    if (DATA.graphicsApp && DATA.graphicsApp.serviceContextId) {
        publishApplicationState(DATA.graphicsApp, 'started');
    }
    client.publish(_t.graphics_layer, next ? appHosts.entryUrl(next.origin, epUrl) : '');
    return Promise.all(pending).then(() => undefined);
}

// Change of state of the application, for the other components; published
// here until the Application Lifecycle Manager exists.
function publishApplicationState(app, state) {
    const message = { serviceContextId: app.serviceContextId, appId: app.appId, origin: app.origin, state };
    client.publish(_t.application_state, JSON.stringify(message));
}

function setVideoURL(url = '') {
    if (url.endsWith('m3u8') || url.endsWith('mpd')) {
        let file = url.split('/').pop();
        DATA.videoStreamURL = url.replace(`/${file}`, '');
        client.publish(_t.pmplayer_url, `/videoStreamProxy/${file}`);
    }
    else {
        client.publish(_t.pmplayer_url, url);
    }
}

function setVideoSize(top = '0', left = '0', width = '100%', height = '100%') {
    client.publish(_t.pmplayer_size, JSON.stringify({
        top: top,
        left: left,
        width: width,
        height: height
    }));
}

// Profiles read directly from storage, all of them, without the visibility
// filter. A base without profiles gets the default profile. A Redis failure
// rejects.
async function refreshUserData() {
    let ids = await redis.smembers('users:index');
    if (ids.length === 0) {
        await profiles.ensureDefaultProfile();
        ids = await redis.smembers('users:index');
    }

    const details = await Promise.all(ids.map(async id => {
        const d = await redis.hgetall(`user:${id}`);
        return { id, name: d.nickname || d.name || id, avatar: d.avatar || null };
    }));

    DATA.users.length = 0;
    details.forEach(u => DATA.users.push(u));
    console.log(`Loaded ${DATA.users.length} users from Redis`);
}

// Boot and MQTT path: retries and logs. Without a current profile, the
// first one; after that, only the choice in the chooser sets it.
async function loadUserData(attempt = 1) {
    try {
        await refreshUserData();
        if (DATA.users.length > 0 && !DATA.currentUser) {
            await setCurrentUser(DATA.users[0].id);
        }
    } catch (err) {
        // Redis may be slow to start: retry, at most 5 times, with backoff.
        if (attempt < 5) {
            const delay = attempt * 2000;
            console.log(`Falha carregando users do Redis (tentativa ${attempt}/${5}, retry em ${delay}ms): ${err.message}`);
            setTimeout(() => loadUserData(attempt + 1), delay);
        } else {
            console.error(`Desistindo de carregar users do Redis apos ${attempt} tentativas: ${err.message}`);
        }
    }
}

// Writes lastAccess on every change of the current user, including one that
// arrives on aop/currentUser. The echo of its own publication is ignored;
// the retained message received at boot counts as an access.
function loadCurrentUser(message) {
    const uid = message.toString();
    if (uid === DATA.currentUser) return;
    DATA.currentUser = uid;
    profiles.touchLastAccess(uid)
        .catch(err => console.error(`[profiles] falha gravando lastAccess de ${uid}: ${err.message}`));
}

// Writes lastAccess first: if storage fails, the change does not happen and
// the error is thrown.
async function setCurrentUser(uid) {
    await profiles.touchLastAccess(uid.toString());
    DATA.currentUser = uid.toString();
    client.publish(_t.current_user, uid.toString(), { retain : true });
}

function getCurrentUser() {
    return DATA.currentUser;
}

// A profile already removed from storage: removing the current one leaves
// aop/currentUser empty until the choice in the chooser; the removal goes to
// aop/removedUser, and the platform goes back to the profile chooser.
function profileRemoved(uid) {
    const i = DATA.users.findIndex(u => u.id === uid);
    if (i >= 0) DATA.users.splice(i, 1);
    if (uid === DATA.currentUser) {
        DATA.currentUser = '';
        client.publish(_t.current_user, '', { retain : true });
    }
    client.publish(_t.removed_user, uid);
    setDisplayGui(GUI.profile_chooser);
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
    client.subscribe(_t.sls_metadata.replace('+', sid), { noLocal : true });
}

function unsetCurrentService() {
    client.unsubscribe(_t.sls_metadata.replace('+', DATA.currentService), { noLocal : true });
    client.publish(_t.current_service, '', { retain : true });
    DATA.currentService = '';
    DATA.serviceMetadata = {};
}

// { serviceContextId, bam } of the current service, from the received LLS.
function getCurrentService() {
    return lls.service(DATA.currentService);
}

function loadSLSMetadata(meta, topic) {
    let sls = topic.split('/').at(-1);

    if (!meta || meta == '') {
        DATA.serviceMetadata[sls] = undefined;
        if (sls == 'bald') {
            DATA.serviceMetadata.baldHandler = undefined;
        }
        return;
    }

    let t = JSON.parse(meta);
    if (sls == 'esg') {
        DATA.serviceMetadata.esg = t;

        if (DATA.rxgui.current == GUI.bootstrap_app) {
            setDisplayGui(GUI.bootstrap_app);
        }
    }
    else if (sls == 'bald') {
        DATA.serviceMetadata.bald = t;

        if (DATA.serviceMetadata.baldHandler) {
            DATA.serviceMetadata.baldHandler(t);
        }
    }
}

function getServiceSLS() {
    return DATA.serviceMetadata;
}

function setBALDHandler(handler) {
    DATA.serviceMetadata.baldHandler = handler;
}

// Application running in the graphics layer ({ appId, label, origin, target
// }) or null.
function getGraphicsApp() {
    return DATA.graphicsApp;
}

// Application running with this host label, or null.
function getGraphicsAppByLabel(label) {
    return DATA.graphicsApp && DATA.graphicsApp.label === label ? DATA.graphicsApp : null;
}

function getVideoStreamURL() {
    return DATA.videoStreamURL;
}

// Returns the promise of the removal of the associated origin.
function openServiceInfo() {
    if (DATA.rxgui.current == '') {
        setDisplayGui(`${GUI.bootstrap_app}?mode=info`);
    }
    if (DATA.graphicsApp) {
        return setDisplayGraphics();
    }
    return Promise.resolve();
}


module.exports = {
    GUI,
    setDisplayGui,
    setDisplayGraphics,
    setVideoURL,
    setVideoSize,
    setCurrentUser,
    getCurrentUser,
    profileRemoved,
    getUserData,
    getUserList,
    setCurrentService,
    unsetCurrentService,
    getCurrentService,
    getServiceSLS,
    setBALDHandler,
    getGraphicsApp,
    getGraphicsAppByLabel,
    getVideoStreamURL,
    openServiceInfo,
    loadUserData,
    refreshUserData
}