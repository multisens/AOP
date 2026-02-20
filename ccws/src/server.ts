import * as dotenv from 'dotenv';
import http from 'http';
dotenv.config();

import app from './app';
const server = http.createServer(app);
const _PORT = process.env.PORT || 44642;

import ssdpServer from './ssdp-server';
server.listen(_PORT, () => {
    console.log(`Ginga CCWS running on port: ${_PORT}`);
    
    ssdpServer.start();
    console.log('SSDP server running on port 1900');
});


if (process.send) {
    process.send('ready');
}