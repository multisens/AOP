// The only write point of the platform to Redis: each write is an FCALL to
// the "tv30" library (infra/redis/functions.lua), which checks the schema
// and writes atomically; a refusal is a TV30SCHEMA error, nothing written.
const redis = require('./redis-client');

// Refusal by the profile limit (maxMembers of users:index in the schema).
const PROFILE_LIMIT_REFUSAL = /^TV30SCHEMA tv30_profile_write: users:index limit of (\d+) profiles reached/;
const SCHEMA_REFUSAL = /^TV30SCHEMA /;

// users:index, user:{id} rewritten whole and services added to
// user:{id}:consent, in a single operation; a new id beyond the profile
// limit is refused.
function profileWrite(id, services, fields) {
    return fcall('tv30_profile_write', [id, services.length, ...services, ...fieldPairs(fields)]);
}

// Returns the profile limit of a refusal by the limit; for another
// failure, null.
function profileLimitOf(err) {
    const m = PROFILE_LIMIT_REFUSAL.exec((err && err.message) || '');
    return m ? Number(m[1]) : null;
}

// lastAccess only of a profile in users:index (no stray hash); true if
// written.
async function profileLastAccess(id, ms) {
    return Number(await fcall('tv30_profile_last_access', [id, ms])) === 1;
}

// Removal of the profile: users:index, user:{id}, user:{id}:consent and
// every user:{id}:broadcaster-attrs:* in a single operation. Returns the
// number of keys and members removed.
async function profileRemove(id) {
    return Number(await fcall('tv30_profile_remove', [id]));
}

function originRegister(origin, service) {
    return fcall('tv30_origin_register', [origin, service]);
}

function originRemove(origin) {
    return fcall('tv30_origin_remove', [origin]);
}

function originsClear() {
    return fcall('tv30_origins_clear', []);
}

// services:announced rewritten whole with these ids; an empty list deletes
// it.
function announcedServices(ids) {
    return fcall('tv30_announced_services', ids);
}

// Refusal of data outside the schema (nothing written): repeating does not
// change the result.
function isSchemaRefusal(err) {
    return SCHEMA_REFUSAL.test((err && err.message) || '');
}

// numkeys 0: the functions derive the keys from the arguments.
function fcall(name, args) {
    return redis.call('FCALL', name, 0, ...args.map(String));
}

function fieldPairs(fields) {
    return Object.keys(fields).sort().flatMap(k => [k, String(fields[k])]);
}

module.exports = {
    profileWrite, profileLimitOf, profileLastAccess, profileRemove, originRegister, originRemove, originsClear, announcedServices, isSchemaRefusal,
};
