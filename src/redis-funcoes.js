// Unico ponto de escrita da plataforma no Redis (test/redis-escritas.test.js
// confere): cada escrita e um FCALL a biblioteca "tv30" (infra/redis/funcoes.lua),
// que confere o esquema e grava atomicamente; recusa = erro TV30ESQUEMA, nada gravado.
const redis = require('./redis-client');

// numkeys 0: as funcoes derivam as chaves dos argumentos
function fcall(nome, args) {
    return redis.call('FCALL', nome, 0, ...args.map(String));
}

function pares(campos) {
    return Object.keys(campos).sort().flatMap(k => [k, String(campos[k])]);
}

// users:index + user:{id} regravado inteiro + servicos acrescentados a
// user:{id}:consent, numa operacao so; id novo alem do teto de perfis e recusado
function perfilGrava(id, servicos, campos) {
    return fcall('tv30_perfil_grava', [id, servicos.length, ...servicos, ...pares(campos)]);
}

// Recusa do teto de perfis (maxMembros de users:index no esquema): devolve o
// teto; outra falha, null
const TETO_PERFIS = /^TV30ESQUEMA tv30_perfil_grava: users:index teto de (\d+) perfis atingido/;
function tetoDePerfis(err) {
    const m = TETO_PERFIS.exec((err && err.message) || '');
    return m ? Number(m[1]) : null;
}

// lastAccess so de perfil em users:index (sem hash avulso); true se gravou
async function perfilUltimoAcesso(id, ms) {
    return Number(await fcall('tv30_perfil_ultimo_acesso', [id, ms])) === 1;
}

// remocao do perfil: users:index, user:{id}, user:{id}:consent e todo
// user:{id}:broadcaster-attrs:* (gravados pelo tv3ws) numa operacao so.
// Devolve o numero de chaves e membros removidos.
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

// services:announced regravado inteiro com estes ids; lista vazia apaga
function servicosAnunciados(ids) {
    return fcall('tv30_servicos_anunciados', ids);
}

// recusa de dado fora do esquema (nada gravado): repetir nao muda o resultado
function recusaDoEsquema(err) {
    return /^TV30ESQUEMA /.test((err && err.message) || '');
}

module.exports = { perfilGrava, tetoDePerfis, perfilUltimoAcesso, perfilRemove, origemRegistra, origemRemove, origensLimpa, servicosAnunciados, recusaDoEsquema };
