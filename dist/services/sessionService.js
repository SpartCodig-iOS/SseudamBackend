"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSessionCount = exports.cleanExpiredSessions = exports.deleteUserSessions = exports.deleteSession = exports.updateSessionLastLogin = exports.getSession = exports.createSession = void 0;
const crypto_1 = require("crypto");
// 인메모리 세션 저장소 (실제 운영에서는 Redis 등을 사용)
const sessions = new Map();
// 세션 ID 생성
const generateSessionId = () => {
    return (0, crypto_1.randomBytes)(32).toString('hex');
};
// 세션 생성
const createSession = (user, loginType, ttlMinutes = 1440) => {
    const sessionId = generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000); // 24시간 (1440분) 기본
    const sessionData = {
        sessionId,
        userId: user.id,
        email: user.email,
        name: user.name,
        loginType,
        lastLoginAt: now.toISOString(),
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
    };
    sessions.set(sessionId, sessionData);
    return sessionData;
};
exports.createSession = createSession;
// 세션 조회
const getSession = (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return null;
    }
    // 만료된 세션은 삭제하고 null 반환
    if (new Date() > new Date(session.expiresAt)) {
        sessions.delete(sessionId);
        return null;
    }
    return session;
};
exports.getSession = getSession;
// 세션 갱신 (마지막 로그인 시간 업데이트)
const updateSessionLastLogin = (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return null;
    }
    // 만료된 세션은 삭제하고 null 반환
    if (new Date() > new Date(session.expiresAt)) {
        sessions.delete(sessionId);
        return null;
    }
    // 마지막 로그인 시간 업데이트
    session.lastLoginAt = new Date().toISOString();
    sessions.set(sessionId, session);
    return session;
};
exports.updateSessionLastLogin = updateSessionLastLogin;
// 세션 삭제 (로그아웃)
const deleteSession = (sessionId) => {
    return sessions.delete(sessionId);
};
exports.deleteSession = deleteSession;
// 사용자의 모든 세션 삭제
const deleteUserSessions = (userId) => {
    let deleted = 0;
    for (const [sessionId, session] of sessions.entries()) {
        if (session.userId === userId) {
            sessions.delete(sessionId);
            deleted++;
        }
    }
    return deleted;
};
exports.deleteUserSessions = deleteUserSessions;
// 만료된 세션들 정리
const cleanExpiredSessions = () => {
    const now = new Date();
    let cleaned = 0;
    for (const [sessionId, session] of sessions.entries()) {
        if (now > new Date(session.expiresAt)) {
            sessions.delete(sessionId);
            cleaned++;
        }
    }
    return cleaned;
};
exports.cleanExpiredSessions = cleanExpiredSessions;
// 현재 활성 세션 수 반환
const getActiveSessionCount = () => {
    return sessions.size;
};
exports.getActiveSessionCount = getActiveSessionCount;
