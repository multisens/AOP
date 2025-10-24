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

module.exports = router;