import { Request, Response } from 'express';
import logger from '../../logger';
import * as manager from '../../modules/auth-manager/manager'
import service, { pairingMethods } from './service';
import { getClientIP, isLocalClient, returnError } from '../../util';


async function GETAuthorize(req: Request, res: Response): Promise<void> {
    logger.debug('\nReceived call to /authorize');

    const clientId = req.query.clientid;
    const displayName = req.query['display-name'];
    if (clientId === undefined || displayName === undefined) {
        returnError(res, 105);
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
        returnError(res, 105);
        return
    }

    if (!pairingMethods.includes(pm as string)) {
        returnError(res, 101);
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
        returnError(res, 101);
        return false;
    }

    if (manager.isBlocked(clientId as string)) {
        returnError(res, 102);
        return false;
    }
    
    const authorized = await service.askAuthorization(displayName as string);
    if (authorized) {
        manager.AuthorizeClient(clientId);
    }
    else {
        manager.BlockClient(clientId);
        returnError(res, 102);
    }
    return authorized;
}


export default { GETAuthorize }