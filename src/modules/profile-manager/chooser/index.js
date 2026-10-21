const core = require('../../../core');
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();
const service = require('./service');

router.get('/', async (req, res, next) => {
    // O chooser roda SEM servico ativo: limpa o aop/currentService retido (pode
    // ter ficado no broker apos um restart). Falha do Redis -> 404 {error:200}.
    core.unsetCurrentService();
    await core.refreshUserData();

    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'),
        {
            cards: service.cards(),
            basepath: core.GUI.profile_chooser,
            defaultAvatar: require('../avatar').DEFAULT_AVATAR_SVG
        });
    res.send(html);
});

router.get('/create', (req, res) => {
    core.setDisplayGui(core.GUI.profile_creator);
    res.status(200).send();
});

router.get('/select', async (req, res) => {
    if (req.query.id) {
        // grava o lastAccess; falha do Redis -> 404 {error:200}
        await core.setCurrentUser(req.query.id);
        core.setDisplayGui(core.GUI.app_catalogue);
        res.status(200).send();
        return;
    }
    res.status(400).send();
});


module.exports = router;