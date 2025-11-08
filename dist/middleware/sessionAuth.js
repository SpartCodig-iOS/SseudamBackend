"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionAuthenticate = void 0;
const sessionService_1 = require("../services/sessionService");
const sessionAuthenticate = (req, res, next) => {
    try {
        // X-Session-ID 헤더에서 세션 ID 가져오기
        const sessionId = req.headers['x-session-id'];
        if (!sessionId) {
            return res.status(401).json({
                code: 401,
                data: [],
                message: 'Session ID required in X-Session-ID header',
            });
        }
        // 세션 조회 및 마지막 로그인 시간 업데이트
        const session = (0, sessionService_1.updateSessionLastLogin)(sessionId);
        if (!session) {
            return res.status(401).json({
                code: 401,
                data: [],
                message: 'Invalid or expired session',
            });
        }
        // request 객체에 세션 정보 추가
        req.session = session;
        next();
    }
    catch (error) {
        return res.status(401).json({
            code: 401,
            data: [],
            message: 'Session authentication failed',
        });
    }
};
exports.sessionAuthenticate = sessionAuthenticate;
