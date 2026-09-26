// Gestor de perfis (M1): a view de criacao mora DENTRO do modulo e o
// backend de criacao e da propria plataforma — escrita direta no
// armazenamento, com o teto de perfis de P3 (ver ../service.js). A antiga
// rota fora-da-spec POST /tv3/users do tv3ws deixou de existir.
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

router.post('/create', async (req, res) => {
    try {
        const result = await service.createProfile(req.body || {});
        await core.loadUserData();
        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
