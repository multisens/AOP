require('dotenv').config();
const Redis = require('ioredis');

// Escritas so por ./redis-functions.js; falha rapida e log: ./redis-options.js.
const { redisOptions, logRedisEvents } = require('./redis-options');

const options = redisOptions();
const redis = new Redis(options);
logRedisEvents(redis, `${options.host}:${options.port}`);

module.exports = redis;
