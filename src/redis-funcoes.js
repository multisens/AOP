// The only write point of the platform to Redis: each write is an FCALL to
// the "tv30" library (infra/redis/funcoes.lua), which checks the schema and
// writes atomically; a refusal is a TV30ESQUEMA error, nothing written.
const redis = require('./redis-client');

// numkeys 0: the functions derive the keys from the arguments.
function fcall(nome, args) {
    return redis.call('FCALL', nome, 0, ...args.map(String));
}

function pares(campos) {
    return Object.keys(campos).sort().flatMap(k => [k, String(campos[k])]);
}

// users:index, user:{id} rewritten whole and services added to
// user:{id}:consent, in a single operation; a new id beyond the profile
// limit is refused.
function perfilGrava(id, servicos, campos) {
    return fcall('tv30_perfil_grava', [id, servicos.length, ...servicos, ...pares(campos)]);
}

// Refusal by the profile limit (maxMembros of users:index in the schema):
// returns the limit; for another failure, null.
const TETO_PERFIS = /^TV30ESQUEMA tv30_perfil_grava: users:index teto de (\d+) perfis atingido/;
function tetoDePerfis(err) {
    const m = TETO_PERFIS.exec((err && err.message) || '');
    return m ? Number(m[1]) : null;
}

// lastAccess only of a profile in users:index (no stray hash); true if
// written.
async function perfilUltimoAcesso(id, ms) {
    return Number(await fcall('tv30_perfil_ultimo_acesso', [id, ms])) === 1;
}

// Removal of the profile: users:index, user:{id}, user:{id}:consent and
// every user:{id}:broadcaster-attrs:* in a single operation. Returns the
// number of keys and members removed.
async function perfilRemove(id) {
    return Number(await fcall('tv30_perfil_remove', [id]));
}

function origemRegistra(origem, servico) {
    return fcall('tv30_origem_registra', [origem, servico]);
}

function origemRemove(origem) {
    return fcall('tv30_origem_remove', [origem]);
}

function origensLimpa() {
    return fcall('tv30_origens_limpa', []);
}

// services:announced rewritten whole with these ids; an empty list deletes
// it.
function servicosAnunciados(ids) {
    return fcall('tv30_servicos_anunciados', ids);
}

// Refusal of data outside the schema (nothing written): repeating does not
// change the result.
function recusaDoEsquema(err) {
    return /^TV30ESQUEMA /.test((err && err.message) || '');
}

module.exports = { perfilGrava, tetoDePerfis, perfilUltimoAcesso, perfilRemove, origemRegistra, origemRemove, origensLimpa, servicosAnunciados, recusaDoEsquema };
