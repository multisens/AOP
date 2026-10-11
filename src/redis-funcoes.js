// P4 (decisao do Luis em 10/10, "Funcoes + auditoria"): ADAPTADOR UNICO das
// escritas da plataforma nas familias do alcance (users:index, user:{id},
// user:{id}:consent, user:{id}:broadcaster-attrs:* no despejo e
// origins:associated). Cada escrita e uma chamada FCALL a uma funcao da
// biblioteca "tv30" do Redis (infra/redis/funcoes.lua), que confere o esquema
// (infra/redis/esquema.json, a fonte de verdade) e grava de forma atomica,
// inclusive as invariantes entre chaves (users:index e user:{id} juntos; o
// despejo leva as quatro familias do perfil). Esquema invalido = erro do
// Redis com prefixo TV30ESQUEMA (funcao, chave, campo e motivo) e NADA
// gravado.
//
// Recusa da funcao e defeito do servico: o erro sobe como qualquer falha do
// Redis — rota HTTP responde 404 {error:200} (platformErrorHandler, que loga a
// mensagem, ./http-error.js); handler MQTT loga.
//
// Fora daqui a plataforma NAO grava no Redis: o teste estatico
// (test/redis-escritas.test.js, regras em infra/redis/test/escritas.js) falha
// se outro arquivo de src/ chamar comando de escrita no cliente Redis.
// As funcoes usam numkeys 0 e derivam as chaves dos argumentos.
const redis = require('./redis-client');

function fcall(nome, args) {
    return redis.call('FCALL', nome, 0, ...args.map(String));
}

// campo, valor, campo, valor... (ordem estavel)
function pares(campos) {
    return Object.keys(campos).sort().flatMap(k => [k, String(campos[k])]);
}

// --- perfis (gestor de perfis, P3) ---

// users:index + user:{id} regravado inteiro + servicos acrescentados a
// user:{id}:consent, numa operacao so
function perfilGrava(id, servicos, campos) {
    return fcall('tv30_perfil_grava', [id, servicos.length, ...servicos, ...pares(campos)]);
}

// lastAccess so de perfil em users:index (sem hash avulso); true se gravou
async function perfilUltimoAcesso(id, ms) {
    return Number(await fcall('tv30_perfil_ultimo_acesso', [id, ms])) === 1;
}

// despejo: users:index, user:{id}, user:{id}:consent e todo
// user:{id}:broadcaster-attrs:* numa operacao so (antes: SREM, DEL, KEYS e DEL
// avulsos). Devolve o numero de chaves e membros removidos.
async function perfilRemove(id) {
    return Number(await fcall('tv30_perfil_remove', [id]));
}

// --- origens das aplicacoes associadas (P1, P1.3) ---

function origemRegistra(origem, servico) {
    return fcall('tv30_origem_registra', [origem, servico]);
}

function origemRemove(origem) {
    return fcall('tv30_origem_remove', [origem]);
}

function origensLimpa() {
    return fcall('tv30_origens_limpa', []);
}

module.exports = { perfilGrava, perfilUltimoAcesso, perfilRemove, origemRegistra, origemRemove, origensLimpa };
