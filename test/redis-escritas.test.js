// P4 (decisao do Luis em 10/10, "Funcoes + auditoria"): teste ESTATICO — a
// plataforma so grava no Redis (users:index, user:*, origins:associated) pelo
// adaptador src/redis-funcoes.js, que chama as funcoes do Redis. Falha se
// outro arquivo de src/ chamar comando de escrita no cliente Redis (set,
// hset, sadd, del, eval, multi, call...).
//
// As regras e a lista de familias vem de infra/redis (verificador
// infra/redis/test/escritas.js e esquema infra/redis/esquema.json): o teste
// precisa do TV30 com os submodulos (aop/ ao lado de infra/).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const VERIFICADOR = path.join(__dirname, '..', '..', 'infra', 'redis', 'test', 'escritas.js');

test('aop: escrita nas familias do alcance do Redis so pelo adaptador das funcoes', () => {
    assert.ok(fs.existsSync(VERIFICADOR), `verificador ${VERIFICADOR} nao encontrado: rode no TV30 com os submodulos (git submodule update --init)`);
    const { verificaModuloJs, modulosTv30 } = require(VERIFICADOR);
    const cfg = modulosTv30(path.join(__dirname, '..', '..')).aop;
    const r = verificaModuloJs({ ...cfg, raiz: path.join(__dirname, '..') });
    assert.deepEqual(r.violacoes, [], r.violacoes.join('\n'));
    assert.deepEqual(r.adaptadorFuncoes, ['tv30_origem_registra', 'tv30_origem_remove', 'tv30_origens_limpa', 'tv30_perfil_grava', 'tv30_perfil_remove', 'tv30_perfil_ultimo_acesso']);
});
