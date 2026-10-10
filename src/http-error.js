// Ultimo middleware das rotas da plataforma (D-0510-6, reuniao 05/10 com o
// Joel): excecao em rota — inclusive promessa rejeitada, que o Express 5
// encaminha para ca, como falha do Redis — vira 404 {error:200} no formato
// C.3.2 (erro 200, "Platform resource unavailable"), em vez de pagina HTML
// de erro ou rota que nunca responde.
function platformErrorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    const msg = err && err.message ? err.message : String(err);
    console.error(`[error] ${req.method} ${req.originalUrl}: ${msg}`);
    res.status(404).json({ error: 200, description: `Platform resource unavailable: ${msg}` });
}

module.exports = { platformErrorHandler };
