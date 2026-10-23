require('dotenv').config();
const fs = require('fs');
const mqtt = require('mqtt');
const redis = require('./redis-client');
const funcoes = require('./redis-funcoes');
const { whenReady } = require('./redis-options');
const profiles = require('./modules/profile-manager/service');
const lls = require('./modules/transport-layer-metadata-lls');
const appHosts = require('./app-hosts');

// Origem propria de cada aplicacao (./app-hosts.js); o server.js ja a validou.
const APPS = appHosts.appsConfig();

// origins:associated: origem da aplicacao em execucao (a que o navegador manda
// no Origin das chamadas dela, nao o alvo do proxy) -> globalServiceId corrente,
// que a borda compara com o contexto de servico do caminho: a aplicacao so
// dispensa o bind-token no proprio contexto. Limpa no boot (sem entrada orfa).
const ORIGINS_KEY = 'origins:associated';
whenReady(redis, `limpeza de ${ORIGINS_KEY}`, () => funcoes.origensLimpa());

function registerAssociatedOrigin(origin) {
    const scid = DATA.currentService;
    if (!scid) return Promise.reject(new Error(`sem servico corrente: a origem ${origin} nao foi registrada como associada`));
    return funcoes.origemRegistra(origin, scid).then(() => origin);
}

function unregisterAssociatedOrigin(origin) {
    return funcoes.origemRemove(origin).then(() => undefined);
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
    // aplicacao na camada grafica: { appId, label, origin, target } ou null
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
    graphics_layer: 'aop/display/layers/graphics'
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

// baseUrl = bcastEntryPackageUrl (alvo do proxy), epUrl = bcastEntryPointUrl,
// appId = appId da BALD (rotulo do host; sem ele, o servico corrente). Sem
// baseUrl, encerra a aplicacao. Publica na hora; a promessa e a do registro.
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

    DATA.graphicsApp = next;
    client.publish(_t.graphics_layer, next ? appHosts.entryUrl(next.origin, epUrl) : '');
    return Promise.all(pending).then(() => undefined);
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

// Perfis lidos direto do armazenamento: a restricao de divulgacao da C.6.14.1
// vale para clientes da API; o gestor de perfis da plataforma ve todos. Base
// sem perfil ganha o perfil padrao. Falha do Redis rejeita (rota HTTP: 404 {error:200}).
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

// Caminho do boot/MQTT (sem rota para responder): tenta de novo e loga. Sem
// perfil corrente, o primeiro; depois disso, so a escolha no seletor o define.
async function loadUserData(attempt = 1) {
    try {
        await refreshUserData();
        if (DATA.users.length > 0 && !DATA.currentUser) {
            await setCurrentUser(DATA.users[0].id);
        }
    } catch (err) {
        // Redis pode demorar pra subir: retry, no maximo 5x, com backoff.
        if (attempt < 5) {
            const delay = attempt * 2000;
            console.log(`Falha carregando users do Redis (tentativa ${attempt}/${5}, retry em ${delay}ms): ${err.message}`);
            setTimeout(() => loadUserData(attempt + 1), delay);
        } else {
            console.error(`Desistindo de carregar users do Redis apos ${attempt} tentativas: ${err.message}`);
        }
    }
}

// A plataforma grava o lastAccess em toda troca de usuario corrente, inclusive
// a que chega por aop/currentUser de outro componente (C.6.14.4 no tv3ws). O
// eco da propria publicacao e ignorado; o retido recebido no boot conta como acesso.
function loadCurrentUser(message) {
    const uid = message.toString();
    if (uid === DATA.currentUser) return;
    DATA.currentUser = uid;
    profiles.touchLastAccess(uid)
        .catch(err => console.error(`[profiles] falha gravando lastAccess de ${uid}: ${err.message}`));
}

// Grava o lastAccess primeiro: se o armazenamento falhar, a troca nao acontece
// e quem chamou recebe o erro (rota: 404 {error:200}).
async function setCurrentUser(uid) {
    await profiles.touchLastAccess(uid.toString());
    DATA.currentUser = uid.toString();
    client.publish(_t.current_user, uid.toString(), { retain : true });
}

function getCurrentUser() {
    return DATA.currentUser;
}

// Perfil ja removido do armazenamento: o corrente removido deixa
// aop/currentUser vazio ate a escolha no seletor; a remocao vai a
// aop/removedUser, e a plataforma volta ao seletor de perfil.
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

// { serviceContextId, bam } do servico corrente, pela LLS recebida
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

// Aplicacao em execucao na camada grafica ({ appId, label, origin, target })
// ou null; usada pelo redirecionamento de /graphicsAppProxy no host do AoP.
function getGraphicsApp() {
    return DATA.graphicsApp;
}

// Aplicacao em execucao com este rotulo de host, ou null (roteamento por Host).
function getGraphicsAppByLabel(label) {
    return DATA.graphicsApp && DATA.graphicsApp.label === label ? DATA.graphicsApp : null;
}

function getVideoStreamURL() {
    return DATA.videoStreamURL;
}

// Devolve a promessa da remocao da origem associada.
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