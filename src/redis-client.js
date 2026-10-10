require('dotenv').config();
const Redis = require('ioredis');

// A plataforma le e escreve o armazenamento DIRETO (P1/P5): a leitura de
// perfis deixou de passar pela porta HTTP do tv3ws (caminho sem credencial
// validada, defeito 6 da vacina), e a lista de origens de aplicacoes
// associadas (origins:associated) e escrita por aqui.
// Opcoes de falha rapida e log de conexao: ./redis-options.js (D-0510-6).
const { redisOptions, logRedisEvents } = require('./redis-options');

const options = redisOptions();
const redis = new Redis(options);
logRedisEvents(redis, `${options.host}:${options.port}`);

module.exports = redis;
