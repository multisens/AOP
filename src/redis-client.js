require('dotenv').config();
const Redis = require('ioredis');

// A plataforma le e escreve o armazenamento DIRETO (P1/P5): a leitura de
// perfis deixou de passar pela porta HTTP do tv3ws (caminho sem credencial
// validada, defeito 6 da vacina), e a lista de origens de aplicacoes
// associadas (origins:associated) e escrita por aqui.
const redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    lazyConnect: false,
    maxRetriesPerRequest: null,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

module.exports = redis;
