"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.generateTokenPair = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const secondsToMs = (value) => value * 1000;
const createAccessPayload = (user, loginType) => ({
    sub: user.id,
    email: user.email,
    name: user.name ?? undefined,
    loginType,
    lastLoginAt: new Date().toISOString(),
});
const createRefreshPayload = (user) => ({
    sub: user.id,
    typ: 'refresh',
});
const generateTokenPair = (user, loginType) => {
    const accessExpiresAt = new Date(Date.now() + secondsToMs(env_1.env.accessTokenTTL));
    const refreshExpiresAt = new Date(Date.now() + secondsToMs(env_1.env.refreshTokenTTL));
    const accessToken = jsonwebtoken_1.default.sign(createAccessPayload(user, loginType), env_1.env.jwtSecret, {
        expiresIn: env_1.env.accessTokenTTL,
    });
    const refreshToken = jsonwebtoken_1.default.sign(createRefreshPayload(user), env_1.env.jwtSecret, {
        expiresIn: env_1.env.refreshTokenTTL,
    });
    return {
        accessToken,
        accessTokenExpiresAt: accessExpiresAt,
        refreshToken,
        refreshTokenExpiresAt: refreshExpiresAt,
    };
};
exports.generateTokenPair = generateTokenPair;
const verifyAccessToken = (token) => {
    return jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
};
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => {
    const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    if (payload.typ !== 'refresh') {
        throw new Error('Invalid refresh token');
    }
    return payload;
};
exports.verifyRefreshToken = verifyRefreshToken;
