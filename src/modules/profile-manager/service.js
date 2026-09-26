// Gestor de perfis da PLATAFORMA (M1 + P3): criacao de perfil e regra de
// teto vivem aqui — nao sao endpoint das APIs de usuario do Anexo C. A
// escrita e direta no armazenamento; a antiga rota fora-da-spec
// POST /tv3/users do tv3ws deixa de existir.
const redis = require('../../redis-client');
const { DEFAULT_AVATAR_SVG } = require('./avatar');

// P3: limite de cinco perfis, com despejo por ultimo acesso mais antigo.
const MAX_PROFILES = 5;

const VALID_RATINGS = ['L', '10', '12', '14', '16', '18'];
const VALID_SIDES = ['left', 'right'];

// ABNT NBR 25608 — Tabela 7 (atributos basicos do perfil do telespectador)
function validateProfile(userData) {
    const nickname = String(userData.nickname || userData.name || '').trim();
    if (!nickname) throw new Error('nickname é obrigatório');
    if (nickname.length > 20) throw new Error('nickname deve ter no máximo 20 caracteres');

    const parentalControl = !!userData.parentalControl;
    if (parentalControl && !userData.maxContentRating) {
        throw new Error('maxContentRating é obrigatório quando parentalControl = true');
    }
    if (userData.maxContentRating && !VALID_RATINGS.includes(userData.maxContentRating)) {
        throw new Error(`maxContentRating deve ser um de: ${VALID_RATINGS.join(', ')}`);
    }

    const closedSigning = !!userData.closedSigning;
    if (closedSigning) {
        if (userData.closedSigningWidth !== undefined) {
            const w = parseInt(userData.closedSigningWidth);
            if (isNaN(w) || w < 14 || w > 28) throw new Error('closedSigningWidth deve estar entre 14 e 28');
        }
        if (userData.closedSigningSide && !VALID_SIDES.includes(userData.closedSigningSide)) {
            throw new Error('closedSigningSide deve ser "left" ou "right"');
        }
    }
    return nickname;
}

// Ultimo acesso do perfil: gravado quando ele vira o usuario corrente
// (lastAccess no hash). Perfil que nunca foi usado conta pelo instante de
// criacao embutido no id (user_<epoch-ms>).
function lastAccessOf(id, fields) {
    const explicit = parseInt(fields.lastAccess || '', 10);
    if (!isNaN(explicit)) return explicit;
    const fromId = parseInt(String(id).replace(/^user_/, ''), 10);
    return isNaN(fromId) ? 0 : fromId;
}

async function evictLeastRecentlyUsed() {
    const ids = await redis.smembers('users:index');

    let oldest = null;
    let oldestTs = Infinity;
    for (const id of ids) {
        const fields = await redis.hgetall(`user:${id}`);
        const ts = lastAccessOf(id, fields);
        if (ts < oldestTs) {
            oldestTs = ts;
            oldest = { id, nickname: fields.nickname || fields.name || id };
        }
    }
    if (!oldest) return null;

    await redis.srem('users:index', oldest.id);
    await redis.del(`user:${oldest.id}`, `user:${oldest.id}:consent`);
    // areas privativas por contexto de servico do perfil despejado
    const attrKeys = await redis.keys(`user:${oldest.id}:broadcaster-attrs:*`);
    if (attrKeys.length > 0) await redis.del(...attrKeys);

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

    const userId = `user_${Date.now()}`;
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
    await redis.sadd('users:index', userId);
    await redis.del(`user:${userId}`);
    await redis.hset(`user:${userId}`, hashFields);
    if (accessConsent.length > 0) {
        await redis.sadd(`user:${userId}:consent`, ...accessConsent);
    }

    return { user: { ...newUser, accessConsent }, evicted };
}

module.exports = { createProfile, MAX_PROFILES };
