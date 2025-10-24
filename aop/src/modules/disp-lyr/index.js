const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('frame', {
        url: 'http://localhost:8080/load'
    });
});

module.exports = router;