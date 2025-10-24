const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();
const service = require('./service');

router.get('/', async (req, res) => {
    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'),
        {
            cards: service.cards(),
            profile: service.profile()
        });
    res.send(html);
});

module.exports = router;