import * as crypto from 'crypto';
import * as core from '../../core';
import logger from '../../logger';
import * as manager from '../../modules/auth-manager/manager'
import { base64UrlEncode, base64UrlDecode, sha256Encrypt, aes128ECBEncrypt } from '../../util';

export const pairingMethods: string[] = ['qrcode'];

async function askAuthorization(displayName: string): Promise<boolean> {
    const message = `A aplicação "${displayName}" deseja acessar as informações do sinal de TV Digital.\nVocê deseja autorizar isto?`;
    const response = await core.showYesNoPopUpAsync(message, 10000);
    logger.debug(`Received response ${response} in askAuthorization`);
    return response;
}

function generateQRCodeChallenge(clientId: string) {
    const simm_key = crypto.randomBytes(32);
    
    // Use key to create QR Code
    const base64Key = base64UrlEncode(simm_key);
    core.showQRCodePopUp(base64Key, 1000);

    // Applies SHA-256 to key and get the 128 most significative bits
    const shaKey = sha256Encrypt(simm_key).subarray(0, 16);

    // Random 16 bytes string for challenge
    const randomString = crypto.randomBytes(16);
    manager.saveClientChallenge(clientId, sha256Encrypt(randomString).toString());

    // Encrypt random string using AES-128 ECB with PKCS#7 padding using SHA-256 key
    const encrypted = aes128ECBEncrypt(randomString, shaKey);

    // return challenge using safe base64 string
    return base64UrlEncode(encrypted);
}

function validateChallengeResponse(clientId: string, challange_response: string) {
    const response = base64UrlDecode(challange_response).toString();
    return response == manager.getClientChallenge(clientId);
}

export default { askAuthorization, generateQRCodeChallenge, validateChallengeResponse }