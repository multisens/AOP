const express = require('express');
const router = express.Router();
const service = require('./service');

router.get('/', async (req, res, next) => {
    res.render('main', {
        content: await service.content(req.app.get('views')),
        current: 'dtv',
        script: service.script(req.query.prev)
    });
});

module.exports = router;