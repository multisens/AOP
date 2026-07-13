const core = require('../../core');
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const router = express.Router();
const service = require('./service');

router.get('/', async (req, res, next) => {
    // O profile-chooser roda SEM service ativo (o telespectador ainda vai
    // escolher o perfil). Limpa qualquer aop/currentService retido — que pode
    // ter ficado preso no broker apos um restart — e recarrega a lista completa
    // do CCWS. Sem isso, o filtro de consent do CCWS esconde todos os perfis e
    // o chooser aparece vazio. O guard resolveActiveService no CCWS cobre a
    // corrida (a limpeza do retido eh assincrona via MQTT).
    core.unsetCurrentService();
    await core.loadUserData();

    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'),
        {
            cards: service.cards(),
            basepath: core.GUI.profile_chooser
        });
    res.send(html);
});

router.get('/create', (req, res) => {
    core.setDisplayGui(core.GUI.profile_creator);
    res.status(200).send();
});

router.get('/select', (req, res) => {
    if (req.query.id) {
        core.setCurrentUser(req.query.id);
        core.setDisplayGui(core.GUI.app_catalogue);
        res.status(200).send();
        return;
    }
    res.status(400).send();
});


module.exports = router;