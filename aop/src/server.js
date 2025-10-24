require('dotenv').config();
const express = require('express');

const _PORT = process.env.PORT || 8080;

// import modules routes
const mod_disp = require('./modules/disp-lyr');
const mod_profile = require('./modules/profile');
const mod_appcat = require('./modules/app-cat');

// middleware configuration
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended : false}));
app.use(express.static('public'));
app.use(express.static(`${process.env.USER_DATA_PATH}/thumbs`));
app.set('view engine', 'ejs');
app.set('views', 'src/views');

// allowing local clients to connect to the server
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    next();
});

// use routes
app.use('/profile', mod_profile);
app.use('/appcat', mod_appcat);
app.use('/', mod_disp);

app.listen(_PORT, () => {
    console.log(`AoP running on port: ${_PORT}`);
});

// start mqtt client
const mqttClient = require('./mqtt-client');

// notify loading is complete
if (process.send) {
    process.send('ready');
}