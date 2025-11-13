"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialAuthService = void 0;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabaseService_1 = require("../../services/supabaseService");
const auth_service_1 = require("../auth/auth.service");
const mappers_1 = require("../../utils/mappers");
const env_1 = require("../../config/env");
let SocialAuthService = class SocialAuthService {
    constructor(supabaseService, authService) {
        this.supabaseService = supabaseService;
        this.authService = authService;
    }
    ensureAppleEnv() {
        if (!env_1.env.appleClientId || !env_1.env.appleTeamId || !env_1.env.appleKeyId || !env_1.env.applePrivateKey) {
            throw new common_1.ServiceUnavailableException('Apple credentials are not configured');
        }
    }
    buildAppleClientSecret() {
        this.ensureAppleEnv();
        const privateKey = env_1.env.applePrivateKey.replace(/\\n/g, '\n');
        const now = Math.floor(Date.now() / 1000);
        return jsonwebtoken_1.default.sign({
            iss: env_1.env.appleTeamId,
            iat: now,
            exp: now + 60 * 10,
            aud: 'https://appleid.apple.com',
            sub: env_1.env.appleClientId,
        }, privateKey, {
            algorithm: 'ES256',
            keyid: env_1.env.appleKeyId,
        });
    }
    async loginWithOAuthToken(accessToken, loginType = 'email', appleRefreshToken, authorizationCode) {
        if (!accessToken) {
            throw new common_1.UnauthorizedException('Missing Supabase access token');
        }
        const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
        if (!supabaseUser) {
            throw new common_1.UnauthorizedException('Invalid Supabase access token');
        }
        await this.supabaseService.ensureProfileFromSupabaseUser(supabaseUser, loginType);
        const preferDisplayName = loginType !== 'email' && loginType !== 'username';
        const user = (0, mappers_1.fromSupabaseUser)(supabaseUser, { preferDisplayName });
        let finalAppleRefreshToken = appleRefreshToken;
        if (loginType === 'apple' && !finalAppleRefreshToken && authorizationCode) {
            finalAppleRefreshToken = await this.exchangeAppleAuthorizationCode(authorizationCode);
        }
        if (loginType === 'apple' && finalAppleRefreshToken) {
            await this.supabaseService.saveAppleRefreshToken(user.id, finalAppleRefreshToken);
        }
        return this.authService.createAuthSession(user, loginType);
    }
    async checkOAuthAccount(accessToken, loginType = 'email') {
        if (!accessToken) {
            throw new common_1.UnauthorizedException('Missing Supabase access token');
        }
        const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
        if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
            throw new common_1.UnauthorizedException('Invalid Supabase access token');
        }
        const profile = await this.supabaseService.findProfileById(supabaseUser.id);
        return { registered: Boolean(profile) };
    }
    async revokeAppleConnection(userId, refreshToken) {
        const tokenToUse = refreshToken ??
            (await this.supabaseService.getAppleRefreshToken(userId)) ??
            null;
        if (!tokenToUse) {
            throw new common_1.BadRequestException('Apple refresh token is required');
        }
        this.ensureAppleEnv();
        const clientSecret = this.buildAppleClientSecret();
        const body = new URLSearchParams({
            token: tokenToUse,
            token_type_hint: 'refresh_token',
            client_id: env_1.env.appleClientId,
            client_secret: clientSecret,
        });
        const response = await fetch('https://appleid.apple.com/auth/revoke', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new common_1.ServiceUnavailableException(`Apple revoke failed: ${response.status} ${text}`);
        }
        await this.supabaseService.saveAppleRefreshToken(userId, null);
    }
    async exchangeAppleAuthorizationCode(code) {
        this.ensureAppleEnv();
        const clientSecret = this.buildAppleClientSecret();
        const body = new URLSearchParams({
            client_id: env_1.env.appleClientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        });
        const response = await fetch('https://appleid.apple.com/auth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new common_1.ServiceUnavailableException(`Apple token exchange failed: ${response.status} ${text}`);
        }
        const result = (await response.json());
        if (!result.refresh_token) {
            throw new common_1.ServiceUnavailableException('Apple did not return a refresh_token');
        }
        return result.refresh_token;
    }
};
exports.SocialAuthService = SocialAuthService;
exports.SocialAuthService = SocialAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => auth_service_1.AuthService))),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        auth_service_1.AuthService])
], SocialAuthService);
