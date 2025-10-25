const core = require('../../core');
require('dotenv').config();
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();

router.get('/', async (req, res) => {
    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'),
        {
            mqtt_host: process.env.MQTT_HOST || 'localhost'
        });
    res.send(html);
});

router.get('/ready', (req, res) => {
    core.setDisplayGui(core.GUI.profile_chooser);
    res.status(200);
});

module.exports = router;