import { randomBytes } from 'crypto';
import { base64UrlEncode } from '../../util';

export default class Client {
    protected id: string;
    protected refreshToken: string;
    protected challenge?: string;
    protected simm_key?: Buffer<ArrayBufferLike>;
    protected accessToken?: string;

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

    public getChallenge(): string {
        return this.challenge as string;
    }

    public setSimmKey(key: Buffer<ArrayBufferLike>) {
        this.simm_key = key;
    }

    public getSimmKey(): Buffer<ArrayBufferLike> {
        return this.simm_key as Buffer<ArrayBufferLike>;
    }

    public setAccessToken(token: string) {
        this.accessToken = token;
    }

    public hasAccessToken(): boolean {
        return this.accessToken !== undefined;
    }

    public getAccessToken(): string {
        return this.accessToken as string;
    }

    protected createRefreshToken(): string {
        return base64UrlEncode(randomBytes(16));
    }
}