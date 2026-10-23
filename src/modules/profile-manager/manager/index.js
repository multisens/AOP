// Criacao e remocao de perfil: views e backend da propria plataforma (../service.js).
const ejs = require('ejs');
const express = require('express');
const path = require('path');
const core = require('../../../core');
const service = require('../service');
const { DEFAULT_AVATAR_SVG, AVATAR_COLORS } = require('../avatar');
const router = express.Router();

router.get('/create', async (req, res) => {
    const html = await ejs.renderFile(path.join(__dirname, 'view.ejs'), {
        defaultAvatar: DEFAULT_AVATAR_SVG,
        avatarColors: AVATAR_COLORS,
    });
    res.send(html);
});

// so erro de validacao responde 400 {error: mensagem} (contrato da view);
// falha do armazenamento sobe e vira 404 {error:200} (platformErrorHandler)
router.post('/create', async (req, res) => {
    let result;
    try {
        result = await service.createProfile(req.body || {});
    } catch (err) {
        if (err instanceof service.ValidationError) {
            res.status(400).json({ error: err.message });
            return;
        }
        throw err;
    }
    await core.refreshUserData();
    res.status(201).json(result);
});

// Remocao pelo telespectador, a partir da tela de escolha de perfil (nao ha
// API do Anexo C para ela); mesmo contrato de erro da criacao
router.post('/remove', async (req, res) => {
    const id = String((req.body && req.body.id) || '');
    try {
        await service.removeProfile(id);
    } catch (err) {
        if (err instanceof service.ValidationError) {
            res.status(400).json({ error: err.message });
            return;
        }
        throw err;
    }
    core.profileRemoved(id);
    res.status(200).json({ id });
});

module.exports = router;
