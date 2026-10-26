// aop-transport-layer-metadata-lls (7.2.2): receives the LLS of the simulated
// transport layer and owns the list of announced services (services:announced
// in Redis and the retained topic aop/services), one per BAM, by the
// globalServiceId.
const redis = require('../../redis-client');
const funcoes = require('../../redis-funcoes');

const TOPIC = 'tlm/lls/#';
const SERVICES_TOPIC = 'aop/services';
const SERVICES_KEY = 'services:announced';
const RETRY_MAX_MS = 10000;

// BAMT of each stream (<bsid>); the one received last is at the end.
const bamts = new Map();
let publish = null;
let chain = Promise.resolve();
let retryTimer = null;
let failures = 0;

// [{ serviceContextId, bam }]: the globalServiceId is the serviceContextId
// (C.3.5); repeated in more than one BAMT, the BAM of the one received last
// prevails.
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

// One write at a time, of the current state; the topic is published only
// with Redis written. A Redis failure is retried; a schema refusal is not.
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

// publish(topic, message) publishes retained. The first write, with no BAMT
// yet, removes from Redis the list of the previous start.
function start(pub) {
    publish = pub;
    return commit();
}

// tlm/lls/<bsid>/bamt; an empty message removes the stream. The other LLS
// tables do not change the list.
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

// For the Application Catalog: those in services:announced, with the BAM;
// without a received BAM there is nothing to show. A Redis failure rejects.
async function services() {
    const inStore = new Set(await redis.smembers(SERVICES_KEY));
    return announced().filter(s => inStore.has(s.serviceContextId));
}

// { serviceContextId, bam } of the announced service, or undefined.
function service(scid) {
    return announced().find(s => s.serviceContextId === scid);
}

module.exports = { TOPIC, SERVICES_TOPIC, SERVICES_KEY, start, receive, services, service };
