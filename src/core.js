require('dotenv').config();
const fs = require('fs');
const mqtt = require('mqtt');
const redis = require('./redis-client');
const funcoes = require('./redis-funcoes');
const { whenReady } = require('./redis-options');
const profiles = require('./modules/profile-manager/service');
const appHosts = require('./app-hosts');

// P1.3 (decisao do Luis em 10/10): cada aplicacao de emissora abre na sua
// propria origem, http://<rotulo>.<APPS_DOMAIN>:<AOP_PUBLIC_PORT> (ver
// ./app-hosts.js). Configuracao lida uma vez; o server.js ja a validou no
// boot.
const APPS = appHosts.appsConfig();

// Lista de origens de aplicacoes associadas (P1): escrita pela plataforma,
// limpa no boot para que parada anormal nao deixe entrada orfa. P4 (Luis,
// 10/10): registro, remocao e limpeza passam pelas funcoes do Redis
// (./redis-funcoes.js), que conferem o esquema da origem (como o navegador a
// manda no Origin: esquema e host em minusculas, sem porta padrao).
// Desde o P1.3, o registro guarda a origem PROPRIA da aplicacao — a mesma
// que o navegador manda no Origin das chamadas dela, porque a camada grafica
// a abre nesse host (antes: o alvo do proxy, http://bcast:8081, que nenhum
// navegador mandava, e as aplicacoes nao eram reconhecidas como associadas).
// O valor e o id do servico corrente (o globalServiceId do BAM): desde 15/10
// a borda o compara com o contexto de servico do caminho (H1, Joel), e a app
// so dispensa o bind-token no proprio contexto. Sem servico corrente a origem
// nao e registrada (ate 15/10 ia o literal 'current-service', que a H1 leria
// como servico nenhum).
// D-0510-6 (reuniao 05/10 com o Joel): registro e remocao devolvem a
// promessa (antes: .catch que so logava); quem chama de rota HTTP espera e a
// falha vira 404 {error:200}; quem chama de handler MQTT loga.
const ORIGINS_KEY = 'origins:associated';
whenReady(redis, `limpeza de ${ORIGINS_KEY}`, () => funcoes.origensLimpa());

function registerAssociatedOrigin(origin) {
    const scid = DATA.currentService;
    if (!scid) return Promise.reject(new Error(`sem servico corrente: a origem ${origin} nao foi registrada como associada (H1)`));
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
    serviceList: new Map(),
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
    current_service: 'aop/currentService',
    lls_metadata: 'tlm/lls/#',
    sls_metadata: 'tlm/sls/+/#',
    gui_layer: 'aop/display/layers/rxgui',
    pmplayer_url : 'aop/display/layers/video/url',
    pmplayer_size : 'aop/display/layers/video/size',
    graphics_layer: 'aop/display/layers/graphics'
};

// (a assinatura de aop/users saiu em 10/10: ninguem publica o topico — o
// notifyUsersChanged, que o publicaria, ja tinha saido, sem chamador — e o
// tv3ws deixou de sincronizar perfis em 05/10, D-0510-5. A carga da lista de
// perfis segue no connect, abaixo.)
const _topics = new Map([
    [_t.current_user, loadCurrentUser],
    [_t.current_service, loadCurrentService],
    [_t.lls_metadata, loadLLSMetadata]
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

// A camada grafica e publicada na hora, como antes; a promessa devolvida e a
// do registro/remocao da origem no armazenamento (D-0510-6).
// baseUrl = bcastEntryPackageUrl (alvo do proxy), epUrl = bcastEntryPointUrl
// e appId = appId da entrada da BALD (rotulo do host; sem ele, o id do
// servico corrente). Sem baseUrl, encerra a aplicacao.
function setDisplayGraphics(baseUrl = '', epUrl = '', appId = '') {
    let next = null;
    if (baseUrl !== '') {
        next = appHosts.describeApp(appId || DATA.currentService, baseUrl, APPS);
        if (!next) console.error(`[apps] bcastEntryPackageUrl invalido, aplicacao nao aberta: '${baseUrl}'`);
    }

    // registro/remocao no lancamento e encerramento da aplicacao (P1, P1.3)
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

// A plataforma le os perfis DIRETO do armazenamento (P1 item 8): o
// antigo caminho HTTP pela porta do tv3ws entrava sem credencial
// validada e era o que mantinha a porta do servico alcancavel por fora
// do gateway (defeito 6). A restricao de divulgacao de C.6.14.1 e para
// clientes na fronteira da API — o gestor de perfis da plataforma ve
// todos os perfis por definicao.
// D-0510-6: falha do Redis REJEITA (antes, falha num perfil virava cartao
// com o id e a da lista inteira so ia para o log, e a tela do chooser saia
// com a lista velha). Rotas HTTP usam esta funcao e respondem 404 {error:200}.
async function refreshUserData() {
    const ids = await redis.smembers('users:index');

    const details = await Promise.all(ids.map(async id => {
        const d = await redis.hgetall(`user:${id}`);
        return { id, name: d.nickname || d.name || id, avatar: d.avatar || null };
    }));

    DATA.users.length = 0;
    details.forEach(u => DATA.users.push(u));

    if (DATA.users.length > 0 && !DATA.currentUser) {
        await setCurrentUser(DATA.users[0].id);
    }
    console.log(`Loaded ${DATA.users.length} users from Redis`);
}

// Caminho do boot/MQTT (sem rota para responder): tenta de novo e loga.
async function loadUserData(attempt = 1) {
    try {
        await refreshUserData();
    } catch (err) {
        // Redis pode demorar pra subir. Retry ate 5x com backoff.
        if (attempt < 5) {
            const delay = attempt * 2000;
            console.log(`Falha carregando users do Redis (tentativa ${attempt}/${5}, retry em ${delay}ms): ${err.message}`);
            setTimeout(() => loadUserData(attempt + 1), delay);
        } else {
            console.error(`Desistindo de carregar users do Redis apos ${attempt} tentativas: ${err.message}`);
        }
    }
}

// D-0510-5 (reuniao 05/10 com o Joel): a plataforma, dona dos perfis, grava
// o lastAccess em toda troca de usuario corrente — a feita aqui
// (setCurrentUser) e a que chega por aop/currentUser vinda de outro
// componente (C.6.14.4 no tv3ws). O eco da propria publicacao chega com o
// mesmo valor e e ignorado. O retido recebido no boot conta como acesso, como
// fazia o tv3ws.
function loadCurrentUser(message) {
    const uid = message.toString();
    if (uid === DATA.currentUser) return;
    DATA.currentUser = uid;
    profiles.touchLastAccess(uid)
        .catch(err => console.error(`[profiles] falha gravando lastAccess de ${uid}: ${err.message}`));
}

// Grava o lastAccess ANTES de trocar: se o armazenamento falhar, a troca nao
// acontece e quem chamou recebe o erro (rota: 404 {error:200}).
async function setCurrentUser(uid) {
    await profiles.touchLastAccess(uid.toString());
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
    client.subscribe(_t.sls_metadata.replace('+', sid), { noLocal : true });
}

function unsetCurrentService() {
    client.unsubscribe(_t.sls_metadata.replace('+', DATA.currentService), { noLocal : true });
    client.publish(_t.current_service, '', { retain : true });
    DATA.currentService = '';
    DATA.serviceMetadata = {};
}

function getCurrentService() {
    return DATA.serviceList.get(DATA.currentService);
}

function loadLLSMetadata(meta, topic) {
    if (!meta || meta == '') {
        DATA.serviceList.clear();
        client.unsubscribe(_t.lls_metadata, { noLocal : true });
        client.subscribe(_t.lls_metadata, { noLocal : true });
        return;
    }

    let lls = topic.split('/').at(-1);
    let t = JSON.parse(meta);
    if (lls == 'bamt') {
        t.forEach(bam => {
            if (DATA.serviceList.has(bam.globalServiceId)) {
                DATA.serviceList.get(bam.globalServiceId).bam = bam;
            }
            else {
                DATA.serviceList.set(bam.globalServiceId, { bam: bam });
            }
        });
    }
}

function getServiceList() {
	return DATA.serviceList;
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

        // refresh the bootstrap app if its open
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
// ou null; usada pelo redirecionamento do caminho antigo /graphicsAppProxy no
// host do AoP (decisao do Luis em 11/10).
function getGraphicsApp() {
    return DATA.graphicsApp;
}

// Aplicacao em execucao com este rotulo de host, ou null (roteamento por Host
// do server.js; P1.3).
function getGraphicsAppByLabel(label) {
    return DATA.graphicsApp && DATA.graphicsApp.label === label ? DATA.graphicsApp : null;
}

function getVideoStreamURL() {
    return DATA.videoStreamURL;
}

// (notifyUsersChanged saiu: publicava aop/users para o tv3ws sincronizar o
// userData.json no Redis, o que o tv3ws nao faz mais — D-0510-5. Nao tinha
// chamador.)

// Devolve a promessa da remocao da origem associada (D-0510-6).
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
    getUserData,
    getUserList,
    setCurrentService,
    unsetCurrentService,
    getCurrentService,
    getServiceList,
    getServiceSLS,
    setBALDHandler,
    getGraphicsApp,
    getGraphicsAppByLabel,
    getVideoStreamURL,
    openServiceInfo,
    loadUserData,
    refreshUserData
}