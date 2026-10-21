// Gestor de perfis da plataforma (nao e endpoint das APIs de usuario do Anexo
// C). Grava pelas funcoes do Redis, que conferem a Tabela 7; a validacao daqui
// responde 400 ao formulario, e a recusa da funcao e defeito: 404 {error:200}.
const crypto = require('crypto');
const redis = require('../../redis-client');
const funcoes = require('../../redis-funcoes');
const avatarFiles = require('./avatar');

// 10.3.3: no maximo cinco perfis; o sexto e recusado e nenhum e despejado (o
// despejo por ultimo acesso da 10.3.3 e o da quota de area privativa).
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
// (schemas.json do broker: no maximo 256 caracteres)
const MAX_SERVICE_ID = 256;

// Erro do dado enviado (400 com a mensagem, contrato da view de criacao).
// Falha do armazenamento NAO e ValidationError: sobe e vira 404 {error:200}.
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

    // o que o esquema do Redis tambem confere e o formulario nao limita
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

// A plataforma e a unica que grava o lastAccess, e so de perfil em users:index
// (teste e escrita atomicos na funcao): nao cria hash fantasma nem recria
// perfil removido no meio.
async function touchLastAccess(id, now = Date.now()) {
    if (!id) return false;
    return funcoes.perfilUltimoAcesso(String(id), String(now));
}

async function createProfile(userData) {
    const nickname = validateProfile(userData);

    if ((await redis.scard('users:index')) >= MAX_PROFILES) {
        throw new ValidationError(`O limite de ${MAX_PROFILES} perfis foi atingido. O perfil não foi criado.`);
    }

    // Tabela 7: id "UUID string"; randomUUID gera a versao 4 da RFC 9562 em
    // minusculas, o formato que o esquema do Redis exige.
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

    // o avatar e o NOME do arquivo <USER_DATA_PATH>/thumbs/<id>.svg; SVG do
    // formulario ausente ou invalido grava o padrao (./avatar.js)
    const avatarDoc = avatarFiles.avatarSvg(userData.avatar);
    const newUser = {
        id: userId,
        nickname,
        avatar: avatarFiles.avatarFileName(userId),
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
    // o arquivo primeiro, para o avatar nunca nomear arquivo inexistente;
    // falha ao gravar o perfil apaga o arquivo e sobe
    await avatarFiles.writeAvatarFile(userId, avatarDoc);
    try {
        await funcoes.perfilGrava(userId, accessConsent, hashFields);
    } catch (err) {
        await avatarFiles.removeAvatarFile(userId)
            .catch(e => console.error(`[profiles] perfil ${userId} nao gravado; o arquivo do avatar ficou: ${e.message}`));
        throw err;
    }

    return { user: { ...newUser, accessConsent } };
}

module.exports = { createProfile, touchLastAccess, ValidationError, MAX_PROFILES };
