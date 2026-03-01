import * as dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Client from './client';
dotenv.config();

export type TokenAlg = "HS256" | "HS512" | "RS256" | "RS512";

type TokenHeader = {
    typ: string;
    alg: TokenAlg;
}

type TokenPayload = {
    iat: number;
    nbf: number;
    exp: number;
    iss: string;
}

const jwtSecret = process.env.JWT_SECRET || '0123456789';
const jwtIssuer = process.env.JWT_ISSUER || 'GenericIssuer';

const blockedClients: string[] = [];
const authorizedClients = new Map<string, Client>();


export function isBlocked(id: string): boolean {
    return blockedClients.includes(id);
}


export function isAuthorized(id: string): boolean {
    return authorizedClients.has(id);
}

export function AuthorizeClient(id: string) {
    const client = new Client(id);
    authorizedClients.set(id, client);
}

export function BlockClient(id: string) {
    blockedClients.push(id);
}

export function getClientRefreshToken(id: string): string {
    if (authorizedClients.has(id)) {
        return authorizedClients.get(id)?.getRefreshToken() as string;
    }
    throw Error(`Client ${id} is not authorized.`);
}

export function saveClientChallenge(id: string, challenge: string) {
    if (authorizedClients.has(id)) {
        return authorizedClients.get(id)?.setChallenge(challenge);
    }
    throw Error(`Client ${id} is not authorized.`);
}

export function getClientChallenge(id: string): string {
    if (authorizedClients.has(id)) {
        return authorizedClients.get(id)?.getChallenge() as string;
    }
    throw Error(`Client ${id} is not authorized.`);
}


function createAccessToken(alg: TokenAlg, expires: number = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
        iat: now,
        nbf: now,
        exp: expires,
        iss: jwtIssuer
    }

    return jwt.sign(payload, jwtSecret, { algorithm: alg as any });
}


export function validateAccessToken(token: string) {
    try {
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded !== 'object') {
            return false;
        }

        const { header, payload } = decoded as { header: TokenHeader; payload: TokenPayload };
        if (!header || !payload) {
            return false;
        }

        jwt.verify(token, jwtSecret, { algorithms: [header.alg as any], issuer: jwtIssuer });
        
        return true;
    }
    catch (error) {
        console.log(error);
        return false;
    }
}