import * as dotenv from 'dotenv';
import { Request, Response } from "express";
import { Server } from '@lvcabral/node-ssdp';
import core from './core';
dotenv.config();

const httpPort = process.env.HTTP_PORT || 44642;
const httpsPort = process.env.HTTPS_PORT || 44643;
const brandName = process.env.BRAND_NAME || 'GenericBrand';
const model = process.env.MODEL || 'GenericModel';
const friendlyName = process.env.FRIENDLY_NAME || 'TV 3.0 Receiver';
const pairingMethods = process.env.PAIRING_METHODS || 'qrcode, kex';
const myUDN = process.env.UDN || 'uuid:TV30-1234-5678-9012-345678901234';

import app from './app';
app.use('/manifest', (req: Request, res: Response) => {
  res.setHeader('Server-BaseURL', `${core.server.localIP}:${httpPort}`);
  res.setHeader('Server-SecureBaseURL', `${core.server.localIP}:${httpsPort}`);
  res.setHeader('Server-PairingMethods', pairingMethods);
  res.setHeader('Device-BrandName', brandName);
  res.setHeader('Device-Model', model);
  res.setHeader('Device-FriendlyName', friendlyName);
  res.sendStatus(200);
});

const ssdpServer = new Server({
  location: `http://${core.server.localIP}:${httpPort}/manifest`,
  udn: myUDN,
  ssdpPort: 1900,
  reuseAddr: true,
  adInterval: 10000,
  ttl: 4,
});

ssdpServer.addUSN('urn:schemas-sbtvd-org:service:TV3.0WebServices:1');

export default ssdpServer;