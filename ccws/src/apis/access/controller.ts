import * as dotenv from 'dotenv';
import { Request, Response } from 'express';
import logger from '../../logger';
import * as manager from '../../modules/auth-manager/manager'
import service, { pairingMethods } from './service';
import { getClientIP, isLocalClient, returnError, aes128ECBEncrypt } from '../../util';
dotenv.config();


type TokenResponse = {
    accessToken: string
    tokenType: string
    expiresIn: number
    refreshToken: string
    serverCert?: string
};

async function GETAuthorize(req: Request, res: Response): Promise<void> {
    logger.debug('\nReceived call to /authorize');

    const clientId = req.query.clientid;
    const displayName = req.query['display-name'];
    if (clientId === undefined || displayName === undefined) {
        returnError(res, 105, 'Required headers clientid and/or display-name not defined.');
        return;
    }

    // If it is a local client, return a refresh token
    if (isLocalClient(getClientIP(req))) {
        logger.debug('Request came from local client');
        
        const authorized = await checkAuthorization(clientId as string, displayName as string, res);
        logger.debug(`GETAuthorize received authorized = ${authorized}`);
        if (!authorized) return;

        res.status(200).json({
            refreshToken: manager.getClientRefreshToken(clientId as string)
        });
        return;
    }

    // It is a nom-local client
    const pm = req.query.pm;
    if (pm === undefined) {
        returnError(res, 105, 'Header pm should be defined for nom-local clients.');
        return
    }

    if (!pairingMethods.includes(pm as string)) {
        returnError(res, 101, 'Unsupported pairing method.');
        return
    }

    // Nom-local client using QR Code pairing
    if (pm == 'qrcode') {
        const authorized = await checkAuthorization(clientId as string, displayName as string, res);
        if (!authorized) return;

        res.status(200).json({
            challenge: service.generateQRCodeChallenge(clientId as string)
        });
        return;
    }
}

async function checkAuthorization(clientId: string, displayName: string, res: Response): Promise<boolean> {
    if (manager.isAuthorized(clientId as string)) {
        returnError(res, 101, 'This client was already authorized before.');
        return false;
    }

    if (manager.isBlocked(clientId as string)) {
        returnError(res, 102, 'This client was not authorized before and is blocked.');
        return false;
    }
    
    const authorized = await service.askAuthorization(displayName as string);
    if (authorized) {
        manager.AuthorizeClient(clientId);
    }
    else {
        manager.BlockClient(clientId);
        returnError(res, 102, 'Viewer did not authorize the client.');
    }
    return authorized;
}

function GETToken(req: Request, res: Response): void {
    logger.debug('\nReceived call to /token');

    const clientId = req.query.clientid;
    if (clientId === undefined) {
        returnError(res, 105, 'Required header clientid not defined.');
        return;
    }
    const challengeResponse = req.query['challenge-response'];
    const refreshToken = req.query['refresh-token'];
    if (challengeResponse === undefined && refreshToken === undefined) {
        returnError(res, 105, 'One of [challenge-response, refresh-token] headers should be defined.');
        return;
    }

    const isLocal = isLocalClient(getClientIP(req));

    // A refresh-token was provided
    if (refreshToken){
        // If it came from a nom-local client should be via HTTPS
        if (!isLocal && req.protocol !== 'https') {
            logger.debug('Request came from nom-local client without https');
            returnError(res, 106, 'Subsequent calls should use HTTPS protocol.');
            return;
        }
        
        // Try to validate the refresh-token
        if(!service.validateRefreshToken(clientId as string, refreshToken as string)) {
            returnError(res, 101, `The received refresh-token is not associated to client ${clientId}`);
            return;
        }
    }
    // Otherwise, validate the challenge response
    else if (challengeResponse && !service.validateChallengeResponse(clientId as string, challengeResponse as string)) {
        returnError(res, 102, `Challenge response not correct for client ${clientId}`);
        return;
    }

    // Everything is fine. Generate response body
    const [token, expire] = manager.getClientAccessToken(clientId as string);
    const resp: TokenResponse = {
		accessToken : token,
		tokenType : "Bearer",
		expiresIn : expire,
		refreshToken : manager.updateClientRefreshToken(clientId as string)
	}
    
    // test if is first access of nom-local client
    if (!isLocal && refreshToken === undefined && req.protocol == 'http') {
        logger.info(`First access of nom-local client ${clientId} send response encrypted`);
        
        resp.serverCert = process.env.HTTPS_CERT;

        const simmKey = manager.getClientSimmKey(clientId as string);
        const data = Buffer.from(JSON.stringify(resp), 'utf8');
        const encr = aes128ECBEncrypt(data, simmKey);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.status(200).send(encr);
    }
    else {
        res.status(200).json(resp);
    }
}


export default { GETAuthorize, GETToken }