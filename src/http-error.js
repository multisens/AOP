// Last middleware: an exception in a route (a rejected promise included,
// which Express 5 forwards here, as a Redis failure) becomes 404
// {error:200} in the C.3.2 format.
function platformErrorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    const msg = err && err.message ? err.message : String(err);
    console.error(`[error] ${req.method} ${req.originalUrl}: ${msg}`);
    res.status(404).json({ error: 200, description: `Platform resource unavailable: ${msg}` });
}

module.exports = { platformErrorHandler };
