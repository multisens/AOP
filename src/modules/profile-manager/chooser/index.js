const core = require('../../../core');
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
    // D-0510-6: falha do Redis rejeita e o Express 5 leva ao
    // platformErrorHandler (404 {error:200}); antes a tela saia com a lista
    // velha, sem aviso.
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
        // grava o lastAccess (D-0510-5); falha do Redis -> 404 {error:200}
        await core.setCurrentUser(req.query.id);
        core.setDisplayGui(core.GUI.app_catalogue);
        res.status(200).send();
        return;
    }
    res.status(400).send();
});


module.exports = router;