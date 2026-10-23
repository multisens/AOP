const core = require('../../core');
require('dotenv').config();
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();

// The page connects MQTT on its own origin, on /mqtt (../../mqtt-ws.js): the
// view gets no host or port of the broker.
router.get('/', async (req, res) => {
    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'), {});
    res.send(html);
});

router.get('/ready', (req, res) => {
    core.setDisplayGui(core.GUI.profile_chooser);
    res.status(200).send();
});

router.get('/keydown/:keyCode', async (req, res) => {
    if (!req.params.keyCode) {
        res.status(400).send();
        return;
    }

    if (['27', '93'].includes(req.params.keyCode)) {
        // Waits for the removal of the associated origin; a Redis failure gives
        // 404 {error:200}.
        await core.openServiceInfo();
    }
    else if (req.params.keyCode == '33') {
        console.log('channel +');
    }
    else if (req.params.keyCode == '34') {
        console.log('channel -');
    }
    res.status(200).send();
});

module.exports = router;