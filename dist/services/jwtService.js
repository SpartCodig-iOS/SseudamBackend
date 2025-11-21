"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtTokenService = void 0;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const secondsToMs = (value) => value * 1000;
let JwtTokenService = class JwtTokenService {
    createAccessPayload(user, sessionId, loginType) {
        return {
            sub: user.id,
            email: user.email,
            name: user.name ?? undefined,
            loginType,
            lastLoginAt: new Date().toISOString(),
            role: user.role,
            sessionId,
        };
    }
    createRefreshPayload(user, sessionId) {
        return {
            sub: user.id,
            typ: 'refresh',
            sessionId,
        };
    }
    generateTokenPair(user, loginType, sessionId) {
        const accessExpiresAt = new Date(Date.now() + secondsToMs(env_1.env.accessTokenTTL));
        const refreshExpiresAt = new Date(Date.now() + secondsToMs(env_1.env.refreshTokenTTL));
        const accessToken = jsonwebtoken_1.default.sign(this.createAccessPayload(user, sessionId, loginType), env_1.env.jwtSecret, {
            expiresIn: env_1.env.accessTokenTTL,
        });
        const refreshToken = jsonwebtoken_1.default.sign(this.createRefreshPayload(user, sessionId), env_1.env.jwtSecret, {
            expiresIn: env_1.env.refreshTokenTTL,
        });
        return {
            accessToken,
            accessTokenExpiresAt: accessExpiresAt,
            refreshToken,
            refreshTokenExpiresAt: refreshExpiresAt,
        };
    }
    verifyAccessToken(token) {
        return jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    }
    verifyRefreshToken(token) {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        if (payload.typ !== 'refresh') {
            throw new Error('Invalid refresh token');
        }
        return payload;
    }
};
exports.JwtTokenService = JwtTokenService;
exports.JwtTokenService = JwtTokenService = __decorate([
    (0, common_1.Injectable)()
], JwtTokenService);
