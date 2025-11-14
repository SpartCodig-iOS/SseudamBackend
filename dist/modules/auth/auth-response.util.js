"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAuthSessionResponse = void 0;
const mappers_1 = require("../../utils/mappers");
const buildAuthSessionResponse = (result) => ({
    user: (0, mappers_1.toUserResponse)(result.user),
    accessToken: result.tokenPair.accessToken,
    refreshToken: result.tokenPair.refreshToken,
    accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
    refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
    sessionId: result.session.sessionId,
    sessionExpiresAt: result.session.expiresAt,
    lastLoginAt: result.session.lastSeenAt,
    loginType: result.loginType,
});
exports.buildAuthSessionResponse = buildAuthSessionResponse;
