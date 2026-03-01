import { randomBytes } from 'crypto';
import { base64UrlEncode } from '../../util';

export default class Client {
    protected id: string;
    protected refreshToken: string;
    protected challenge?: string;

    constructor(id: string) {
        this.id = id;
        this.refreshToken = this.createRefreshToken();
    }

    public getId(): string {
        return this.id;
    }

    public getRefreshToken(): string {
        return this.refreshToken;
    }

    public updateRefreshToken(): string {
        this.refreshToken = this.createRefreshToken();
        return this.refreshToken;
    }

    public setChallenge(str: string) {
        this.challenge = str;
    }

    public getChallenge() {
        return this.challenge as string;
    }

    protected createRefreshToken(): string {
        return base64UrlEncode(randomBytes(16));
    }
}