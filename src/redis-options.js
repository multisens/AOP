// Options of the Redis client, outside the client to be testable without a
// connection. A Redis failure is fast and explicit, and never hangs a route
// (with maxRetriesPerRequest null, a command without a connection would wait
// forever): a command without a connection fails after one retry (~0.2 to
// 1 s); commandTimeout covers a Redis that accepts the connection and does
// not answer; the offline queue only holds boot and a short reconnection.
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

// Logs the connection events: ready, loss, failures (the first of each
// sequence, and the total on recovery) and end.
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

// Boot task that needs Redis: runs once, on the first 'ready'.
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
