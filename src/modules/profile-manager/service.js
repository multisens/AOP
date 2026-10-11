// Gestor de perfis da PLATAFORMA (M1 + P3): criacao de perfil e regra de
// teto vivem aqui — nao sao endpoint das APIs de usuario do Anexo C. A
// escrita e da plataforma; a antiga rota fora-da-spec POST /tv3/users do
// tv3ws deixa de existir.
// P4 (Luis, 10/10): criacao, despejo e lastAccess passam pelas funcoes do
// Redis (../../redis-funcoes.js), que conferem o esquema da Tabela 7
// (infra/redis/esquema.json) e gravam as chaves do perfil juntas. A
// validacao abaixo continua: e ela que responde 400 com a mensagem para o
// formulario; a recusa da funcao (dado que passou daqui fora do esquema) e
// defeito da plataforma e responde 404 {error:200}.
const crypto = require('crypto');
const redis = require('../../redis-client');
const funcoes = require('../../redis-funcoes');
const { DEFAULT_AVATAR_SVG } = require('./avatar');

// P3: limite de cinco perfis, com despejo por ultimo acesso mais antigo.
const MAX_PROFILES = 5;

const VALID_RATINGS = ['L', '10', '12', '14', '16', '18'];
const VALID_SIDES = ['left', 'right'];

// Tabela 7: idiomas em IETF RFC 5646. Mesma conferencia de formato da funcao
// do Redis (idiomaOk em infra/redis/funcoes.lua): subetiquetas de 1 a 8
// letras ou digitos separadas por '-', a primeira so de letras (2 a 8) ou o
// singleton x/i. Nao confere o registro IANA.
function isLanguageTag(v) {
    if (typeof v !== 'string') return false;
    const parts = v.split('-');
    if (!parts.every(p => /^[A-Za-z0-9]{1,8}$/.test(p))) return false;
    return /^[A-Za-z]{2,8}$/.test(parts[0]) || parts[0] === 'x' || parts[0] === 'i';
}
const LANGUAGE_FIELDS = ['audioLanguage', 'userInterfaceLanguage', 'closedCaptioningLanguage'];
// visibilidade por servico: o id do servico, como em aop/currentService
// (schemas.json do broker: ate 256 caracteres)
const MAX_SERVICE_ID = 256;

// Erro do dado enviado (resposta 400 com a mensagem, contrato da view de
// criacao). Falha do armazenamento NAO e ValidationError: sobe e vira
// 404 {error:200} (D-0510-6; ver ../../http-error.js).
class ValidationError extends Error {}

// ABNT NBR 25608 — Tabela 7 (atributos basicos do perfil do telespectador)
function validateProfile(userData) {
    const nickname = String(userData.nickname || userData.name || '').trim();
    if (!nickname) throw new ValidationError('nickname é obrigatório');
    if (nickname.length > 20) throw new ValidationError('nickname deve ter no máximo 20 caracteres');

    const parentalControl = !!userData.parentalControl;
    if (parentalControl && !userData.maxContentRating) {
        throw new ValidationError('maxContentRating é obrigatório quando parentalControl = true');
    }
    if (userData.maxContentRating && !VALID_RATINGS.includes(userData.maxContentRating)) {
        throw new ValidationError(`maxContentRating deve ser um de: ${VALID_RATINGS.join(', ')}`);
    }

    const closedSigning = !!userData.closedSigning;
    if (closedSigning) {
        if (userData.closedSigningWidth !== undefined) {
            const w = parseInt(userData.closedSigningWidth);
            if (isNaN(w) || w < 14 || w > 28) throw new ValidationError('closedSigningWidth deve estar entre 14 e 28');
        }
        if (userData.closedSigningSide && !VALID_SIDES.includes(userData.closedSigningSide)) {
            throw new ValidationError('closedSigningSide deve ser "left" ou "right"');
        }
    }

    // P4: o que o esquema do Redis tambem confere e o formulario nao limita
    for (const f of LANGUAGE_FIELDS) {
        // a de legenda so e gravada com closedCaptioning ligado (createProfile)
        if (f === 'closedCaptioningLanguage' && !userData.closedCaptioning) continue;
        if (userData[f] !== undefined && userData[f] !== '' && !isLanguageTag(userData[f])) {
            throw new ValidationError(`${f} deve ser uma etiqueta de idioma IETF RFC 5646, como pt-BR`);
        }
    }
    if (userData.accessConsent !== undefined) {
        const ok = Array.isArray(userData.accessConsent) && userData.accessConsent.every(
            s => typeof s === 'string' && s.length > 0 && [...s].length <= MAX_SERVICE_ID);
        if (!ok) throw new ValidationError(`accessConsent deve ser uma lista de ids de serviço (texto de 1 a ${MAX_SERVICE_ID} caracteres)`);
    }
    return nickname;
}

// D-0510-5 (reuniao 05/10 com o Joel; P5, um dono por familia de chave): a
// plataforma e a dona dos perfis (users:index, user:{id}, user:{id}:consent)
// — cria, despeja (P3) e, desde 05/10, e a UNICA que grava o lastAccess
// (antes gravado pelo tv3ws ao receber aop/currentUser). Grava so se o perfil
// existe em users:index: o HSET avulso de antes criava hash fantasma
// user:{id} para id desconhecido. Teste e escrita atomicos (funcao
// tv30_perfil_ultimo_acesso; antes, script EVAL daqui), para nao recriar um
// perfil despejado no meio.
async function touchLastAccess(id, now = Date.now()) {
    if (!id) return false;
    return funcoes.perfilUltimoAcesso(String(id), String(now));
}

// Ultimo acesso do perfil: gravado na criacao e quando ele vira o usuario
// corrente (lastAccess no hash, touchLastAccess). Sem lastAccess (ex.: perfil
// da carga inicial nunca usado), conta como o mais antigo (0). Desde a decisao
// do Luis em 11/10 (F-3) o id e UUID e nao carrega instante nenhum; antes, o
// instante de criacao saia do id user_<epoch-ms> — e um UUID que comeca por
// digitos viraria um instante falso nessa leitura.
function lastAccessOf(fields) {
    const explicit = parseInt(fields.lastAccess || '', 10);
    return isNaN(explicit) ? 0 : explicit;
}

async function evictLeastRecentlyUsed() {
    const ids = await redis.smembers('users:index');

    let oldest = null;
    let oldestTs = Infinity;
    for (const id of ids) {
        const fields = await redis.hgetall(`user:${id}`);
        const ts = lastAccessOf(fields);
        if (ts < oldestTs) {
            oldestTs = ts;
            oldest = { id, nickname: fields.nickname || fields.name || id };
        }
    }
    if (!oldest) return null;

    // users:index, user:{id}, user:{id}:consent e as areas privativas por
    // contexto de servico (user:{id}:broadcaster-attrs:*) saem juntos, numa
    // funcao so (P4; antes SREM, DEL, KEYS e DEL avulsos).
    // PENDENTE (Joel): user:{id}:broadcaster-attrs:{scid} tem dois escritores
    // — o tv3ws grava (C.6.14.5) e a plataforma apaga aqui no despejo (P3).
    // P5 pede um dono por familia de chave; quem e o dono desta nao foi
    // decidido em 05/10. Mantido como estava.
    await funcoes.perfilRemove(oldest.id);

    return oldest;
}

async function createProfile(userData) {
    const nickname = validateProfile(userData);

    // P3: teto de cinco perfis com despejo do de ultimo acesso mais antigo.
    // Laco (limitado) porque uma base anterior ao teto pode ter mais de 5.
    let evicted = null;
    for (let guard = 0; guard < 32 && (await redis.scard('users:index')) >= MAX_PROFILES; guard++) {
        evicted = await evictLeastRecentlyUsed();
        if (!evicted) break;
    }

    // Tabela 7: id "UUID string". Decisao do Luis em 11/10 (F-3): UUID no
    // formato da RFC 9562, em minusculas (o randomUUID gera a versao 4 assim),
    // sem compatibilidade com o id antigo user_<epoch-ms>; pela mesma decisao,
    // o esquema do Redis (infra/redis/esquema.json) exige esse formato.
    const userId = crypto.randomUUID();
    const parentalControl = !!userData.parentalControl;
    const closedCaptioning = !!userData.closedCaptioning;
    const closedSigning = !!userData.closedSigning;

    // O aceite do termo na criacao vira visibilidade (consent) para o
    // servico ativo, para o perfil aparecer na proxima listagem filtrada.
    const currentService = (await redis.get('session:current-service-id')) || '';
    const accessConsent = Array.isArray(userData.accessConsent) ? userData.accessConsent.slice() : [];
    if (currentService && !accessConsent.includes(currentService)) {
        accessConsent.push(currentService);
    }

    const newUser = {
        id: userId,
        nickname,
        avatar: userData.avatar || DEFAULT_AVATAR_SVG,
        parentalControl,
        maxContentRating: parentalControl ? userData.maxContentRating : null,
        audioLanguage: userData.audioLanguage || 'pt-BR',
        closedCaptioningLanguage: closedCaptioning ? (userData.closedCaptioningLanguage || 'pt-BR') : null,
        userInterfaceLanguage: userData.userInterfaceLanguage || 'pt-BR',
        closedCaptioning,
        closedSigning,
        closedSigningSide: closedSigning ? (userData.closedSigningSide || 'right') : null,
        closedSigningWidth: closedSigning ? (userData.closedSigningWidth ? parseInt(userData.closedSigningWidth) : 28) : null,
        audioDescription: !!userData.audioDescription,
        dialogEnhancement: !!userData.dialogEnhancement,
        voiceGuidance: !!userData.voiceGuidance,
        lastAccess: Date.now(),
    };

    const hashFields = {};
    for (const [k, v] of Object.entries(newUser)) {
        if (v !== null && v !== undefined) hashFields[k] = String(v);
    }
    // users:index + user:{id} (DEL + HSET) + user:{id}:consent numa funcao so,
    // que confere a Tabela 7 (P4; antes SADD, DEL, HSET e SADD avulsos)
    await funcoes.perfilGrava(userId, accessConsent, hashFields);

    return { user: { ...newUser, accessConsent }, evicted };
}

module.exports = { createProfile, touchLastAccess, ValidationError, MAX_PROFILES };
