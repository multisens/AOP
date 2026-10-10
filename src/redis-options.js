// Configuracao do cliente Redis da plataforma, separada do cliente para ser
// testada sem abrir conexao (test/redis.test.js).
//
// D-0510-6 (reuniao 05/10 com o Joel): falha de Redis nao pode ser
// silenciosa nem travar. O cliente antigo tinha maxRetriesPerRequest: null —
// com o Redis fora do ar ou congelado, todo comando esperava para sempre e a
// rota HTTP que dependia dele travava (medido em 09/10: sem resposta em 25 s
// nos dois casos). Agora:
// - maxRetriesPerRequest 1: comando enfileirado sem conexao falha apos uma
//   nova tentativa de conexao sem sucesso (~0,2 a 1 s, medido);
// - commandTimeout 1500 ms: limite por comando, inclusive com o Redis
//   aceitando conexao e nao respondendo;
// - connectTimeout 2000 ms: tentativa de conexao a host que nao responde;
// - fila offline LIGADA: comandos do boot e de uma reconexao curta esperam a
//   conexao; o limite acima impede espera longa.
// O cliente continua tentando reconectar (retryStrategy) e volta sozinho.
const FAIL_FAST_OPTIONS = Object.freeze({
    connectTimeout: 2000,
    commandTimeout: 1500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
});

function redisOptions(overrides = {}) {
    return {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        lazyConnect: false,
        ...FAIL_FAST_OPTIONS,
        ...overrides,
    };
}

// Log explicito de conexao: pronto, perda, falhas (a primeira de cada
// sequencia, e o total ao voltar) e encerramento.
function logRedisEvents(client, where, log = console.error) {
    let wasReady = false;
    let failures = 0;
    let lastError = '';
    client.on('ready', () => {
        console.log(`[redis] pronto em ${where}` + (failures ? ` (restabelecido apos ${failures} falha(s))` : ''));
        wasReady = true;
        failures = 0;
        lastError = '';
    });
    client.on('error', (err) => {
        failures++;
        if (err.message !== lastError) log(`[redis] ERRO em ${where}: ${err.message}`);
        lastError = err.message;
    });
    client.on('close', () => {
        if (wasReady) log(`[redis] conexao com ${where} perdida; comandos falham com erro ate reconectar`);
        wasReady = false;
    });
    client.on('end', () => log(`[redis] cliente de ${where} encerrado; sem novas tentativas`));
}

// Tarefa de boot que precisa do Redis: roda UMA vez, no primeiro 'ready'.
// Falha vai para o log com o nome da tarefa.
function whenReady(client, name, task) {
    const run = () => {
        Promise.resolve()
            .then(task)
            .catch((err) => console.error(`[redis] FALHA na tarefa de boot "${name}": ${err && err.message}`));
    };
    if (client.status === 'ready') run();
    else client.once('ready', run);
}

module.exports = { FAIL_FAST_OPTIONS, redisOptions, logRedisEvents, whenReady };
