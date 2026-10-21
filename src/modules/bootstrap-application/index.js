const core = require('../../core');
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();
const service = require('./service');

router.get('/', async (req, res) => {
    service.openBootstrapApp(req.query.mode);

    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'),
        Object.assign({
            profile: service.profile(),
            basepath: core.GUI.bootstrap_app
        },
        service.bootstrapAppData(),
        service.esgData()
    ));
    res.send(html);
});

router.get('/profile', (req, res) => {
    service.closeBootstrapApp(core.GUI.profile_chooser);
    res.status(200).send();
});

router.get('/appcat', (req, res) => {
    service.closeBootstrapApp(core.GUI.app_catalogue);
    res.status(200).send();
});

// espera o registro da origem associada; falha do Redis -> 404 {error:200},
// com a aplicacao ja na camada grafica.
router.get('/fullscr', async (req, res) => {
    await service.fullscreen();
    res.status(200).send();
});

module.exports = router;