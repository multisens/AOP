// Teste ESTATICO: a plataforma so grava no Redis pelo adaptador
// src/redis-funcoes.js. Regras e familias vem de infra/redis (test/escritas.js,
// esquema.json): precisa do TV30 com os submodulos (aop/ ao lado de infra/).
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
    assert.deepEqual(r.adaptadorFuncoes, ['tv30_origem_registra', 'tv30_origem_remove', 'tv30_origens_limpa', 'tv30_perfil_grava', 'tv30_perfil_remove', 'tv30_perfil_ultimo_acesso', 'tv30_servicos_anunciados']);
});
