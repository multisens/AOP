const core = require('../../core');
require('dotenv').config();
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();

// A pagina conecta o MQTT por WebSocket na propria origem, em /mqtt (C1,
// decisao do Luis em 11/10; ../../mqtt-ws.js): nao recebe mais host nem
// porta do broker.
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
        // espera a remocao da origem associada; falha do Redis -> 404
        // {error:200} (D-0510-6)
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