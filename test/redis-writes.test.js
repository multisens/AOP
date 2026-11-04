// STATIC test: the platform writes to Redis only through the adapter
// src/redis-functions.js. Rules and families come from infra/redis
// (test/writes.js, schema.json): needs TV30 with the submodules (aop/
// next to infra/).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CHECKER = path.join(__dirname, '..', '..', 'infra', 'redis', 'test', 'writes.js');

test('aop: escrita nas familias do alcance do Redis so pelo adaptador das funcoes', () => {
    assert.ok(fs.existsSync(CHECKER), `verificador ${CHECKER} nao encontrado: rode no TV30 com os submodulos (git submodule update --init)`);
    const { checkJsModule, tv30Modules } = require(CHECKER);
    const cfg = tv30Modules(path.join(__dirname, '..', '..')).aop;
    const r = checkJsModule({ ...cfg, root: path.join(__dirname, '..') });
    assert.deepEqual(r.violations, [], r.violations.join('\n'));
    assert.deepEqual(r.adapterFunctions, ['tv30_announced_services', 'tv30_origin_register', 'tv30_origin_remove', 'tv30_origins_clear', 'tv30_profile_last_access', 'tv30_profile_remove', 'tv30_profile_write']);
});
