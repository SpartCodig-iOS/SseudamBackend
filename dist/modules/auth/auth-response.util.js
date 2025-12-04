"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAuthSessionResponse = exports.buildLightweightAuthResponse = void 0;
const mappers_1 = require("../../utils/mappers");
// 균형잡힌 경량화 로그인 응답 (OAuth 전용) - 핵심 필드 유지하며 크기 최적화
const buildLightweightAuthResponse = (result) => ({
    user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? null,
        avatarURL: result.user.avatar_url ?? null,
        role: result.user.role,
        userId: result.user.username,
    },
    accessToken: result.tokenPair.accessToken,
    refreshToken: result.tokenPair.refreshToken,
    accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
    refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
    sessionId: result.session.sessionId,
    loginType: result.loginType,
    // 제거된 필드들 (덜 중요): sessionExpiresAt, lastLoginAt, createdAt
});
exports.buildLightweightAuthResponse = buildLightweightAuthResponse;
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
