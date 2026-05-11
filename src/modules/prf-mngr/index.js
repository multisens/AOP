// Apenas serve o HTML do form. O submit faz POST direto no CCWS via
// KrakenD interno (Redis source-of-truth — sem rota backend no AoP).
const express = require('express');
const router = express.Router();

router.get('/create', (req, res) => {
    res.render('create-profile');
});

module.exports = router;