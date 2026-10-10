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

// D-0510-6: so o erro de validacao responde 400 {error: mensagem} (contrato
// da view); falha do armazenamento sobe e vira 404 {error:200}
// (platformErrorHandler) — antes tambem saia como 400 de dado invalido.
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

module.exports = router;
