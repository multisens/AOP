// Gestor de perfis da PLATAFORMA (M1 + P3): criacao de perfil e regra de
// teto vivem aqui — nao sao endpoint das APIs de usuario do Anexo C. A
// escrita e da plataforma; a antiga rota fora-da-spec POST /tv3/users do
// tv3ws deixa de existir.
// P4 (Luis, 10/10): criacao e lastAccess passam pelas funcoes do
// Redis (../../redis-funcoes.js), que conferem o esquema da Tabela 7
// (infra/redis/esquema.json) e gravam as chaves do perfil juntas. A
// validacao abaixo continua: e ela que responde 400 com a mensagem para o
// formulario; a recusa da funcao (dado que passou daqui fora do esquema) e
// defeito da plataforma e responde 404 {error:200}.
const crypto = require('crypto');
const redis = require('../../redis-client');
const funcoes = require('../../redis-funcoes');
const avatarFiles = require('./avatar');

// Limite de cinco perfis (10.3.3). Desde a resposta do Joel de 15/10
// ("Observacoes sobre pontos fora da lista"), a criacao do sexto e RECUSADA, e
// o telespectador e informado; nenhum perfil e despejado. O despejo por
// ultimo acesso da 10.3.3 e da quota de area privativa, e nao dos perfis.
// Apoio: a proposta de emenda da Issue 95 do Forum (PRFFR-07), pela qual
// apagar um perfil exige confirmacao explicita do telespectador. Ate 15/10
// (P3), o sexto despejava o perfil de ultimo acesso mais antigo.
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
// — cria e, desde 05/10, e a UNICA que grava o lastAccess
// (antes gravado pelo tv3ws ao receber aop/currentUser). Grava so se o perfil
// existe em users:index: o HSET avulso de antes criava hash fantasma
// user:{id} para id desconhecido. Teste e escrita atomicos (funcao
// tv30_perfil_ultimo_acesso; antes, script EVAL daqui), para nao recriar um
// perfil removido no meio.
async function touchLastAccess(id, now = Date.now()) {
    if (!id) return false;
    return funcoes.perfilUltimoAcesso(String(id), String(now));
}

async function createProfile(userData) {
    const nickname = validateProfile(userData);

    // Teto de cinco perfis: o sexto e recusado (Joel, 15/10), com a mensagem
    // para o formulario (400). Uma base com mais de cinco tambem recusa.
    if ((await redis.scard('users:index')) >= MAX_PROFILES) {
        throw new ValidationError(`O limite de ${MAX_PROFILES} perfis foi atingido. O perfil não foi criado.`);
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

    // G8 (decisao do Luis em 12/10): o avatar e o NOME do arquivo
    // (<USER_DATA_PATH>/thumbs/<id>.svg, gravado abaixo, antes do perfil), e
    // nao mais o SVG em linha. O SVG do formulario e conferido como as telas
    // conferiam; ausente ou fora disso, grava-se o padrao (./avatar.js).
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
    // G8: o arquivo antes do perfil, para o avatar nunca nomear arquivo que
    // nao existe. Falha ao gravar o arquivo sobe (404 {error:200}) sem gravar
    // o perfil; falha ao gravar o perfil apaga o arquivo e sobe.
    await avatarFiles.writeAvatarFile(userId, avatarDoc);
    // users:index + user:{id} (DEL + HSET) + user:{id}:consent numa funcao so,
    // que confere a Tabela 7 (P4; antes SADD, DEL, HSET e SADD avulsos)
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
