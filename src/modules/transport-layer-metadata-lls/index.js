// aop-transport-layer-metadata-lls (7.2.2): recebe a LLS da camada de transporte
// simulada e e a dona da lista dos servicos anunciados (services:announced no
// Redis e o topico retido aop/services), um por BAM, pelo globalServiceId.
const redis = require('../../redis-client');
const funcoes = require('../../redis-funcoes');

const TOPIC = 'tlm/lls/#';
const SERVICES_TOPIC = 'aop/services';
const SERVICES_KEY = 'services:announced';
const RETRY_MAX_MS = 10000;

// BAMT de cada fluxo (<bsid>); a recebida por ultimo fica no fim
const bamts = new Map();
let publish = null;
let chain = Promise.resolve();
let retryTimer = null;
let failures = 0;

// [{ serviceContextId, bam }]: o globalServiceId e o serviceContextId (C.3.5);
// repetido em mais de uma BAMT, vale o BAM da recebida por ultimo
function announced() {
    const out = new Map();
    for (const bamt of bamts.values()) {
        for (const bam of bamt) {
            const s = out.get(bam.globalServiceId);
            if (s) s.bam = bam;
            else out.set(bam.globalServiceId, { serviceContextId: bam.globalServiceId, bam });
        }
    }
    return [...out.values()];
}

// Uma gravacao por vez, do estado do momento; o topico sai so com o Redis
// gravado. Falha do Redis tenta de novo; recusa do esquema, nao.
function commit() {
    chain = chain.then(write);
    return chain;
}

async function write() {
    const ids = announced().map(s => s.serviceContextId);
    try {
        await funcoes.servicosAnunciados(ids);
    } catch (err) {
        failures++;
        const refused = funcoes.recusaDoEsquema(err);
        if (refused || failures === 1) console.error(`[lls] ${SERVICES_KEY} nao gravado (${ids.length} servico(s)): ${err.message}`);
        if (!refused) retry();
        return;
    }
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    if (failures) console.log(`[lls] ${SERVICES_KEY} gravado depois de ${failures} falha(s)`);
    failures = 0;
    if (publish) publish(SERVICES_TOPIC, JSON.stringify(ids.map(id => ({ serviceContextId: id }))));
}

function retry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; commit(); }, Math.min(failures * 2000, RETRY_MAX_MS));
    retryTimer.unref();
}

// publish(topico, mensagem) publica retido. A primeira gravacao, sem BAMT
// ainda, tira do Redis a lista da partida anterior.
function start(pub) {
    publish = pub;
    return commit();
}

// tlm/lls/<bsid>/bamt; mensagem vazia retira o fluxo. As outras tabelas da LLS
// nao mudam a lista.
function receive(message, topic) {
    const parts = topic.split('/');
    if (parts.length !== 4 || parts[3] !== 'bamt' || !parts[2]) return Promise.resolve();
    const bsid = parts[2];
    if (!message) {
        if (!bamts.delete(bsid)) return Promise.resolve();
        return commit();
    }
    let bamt;
    try {
        bamt = JSON.parse(message);
    } catch (err) {
        console.error(`[lls] BAMT de ${bsid} ignorada: ${err.message}`);
        return Promise.resolve();
    }
    bamts.delete(bsid);
    bamts.set(bsid, Array.isArray(bamt) ? bamt.filter(b => b && typeof b.globalServiceId === 'string' && b.globalServiceId) : []);
    return commit();
}

// Para o Application Catalog: os de services:announced, o conjunto do 304 da
// borda, com o BAM; sem BAM recebido nao ha o que mostrar. Falha do Redis rejeita.
async function services() {
    const inStore = new Set(await redis.smembers(SERVICES_KEY));
    return announced().filter(s => inStore.has(s.serviceContextId));
}

// { serviceContextId, bam } do servico anunciado, ou undefined
function service(scid) {
    return announced().find(s => s.serviceContextId === scid);
}

module.exports = { TOPIC, SERVICES_TOPIC, SERVICES_KEY, start, receive, services, service };
