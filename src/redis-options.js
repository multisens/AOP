// Opcoes do cliente Redis, fora do cliente para testar sem conexao. Falha de
// Redis e rapida e explicita, nunca trava a rota (com maxRetriesPerRequest
// null, o comando sem conexao esperaria para sempre): comando sem conexao falha
// apos uma nova tentativa (~0,2 a 1 s); commandTimeout cobre o Redis que aceita
// conexao e nao responde; a fila offline so segura boot e reconexao curta.
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

// Tarefa de boot que precisa do Redis: roda uma vez, no primeiro 'ready'.
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
