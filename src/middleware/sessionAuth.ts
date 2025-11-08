import { NextFunction, Request, Response } from 'express';
import { getSession, updateSessionLastLogin, SessionData } from '../services/sessionService';

// Request 타입에 session 프로퍼티 추가
declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
    }
  }
}

export const sessionAuthenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    // X-Session-ID 헤더에서 세션 ID 가져오기
    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId) {
      return res.status(401).json({
        code: 401,
        data: [],
        message: 'Session ID required in X-Session-ID header',
      });
    }

    // 세션 조회 및 마지막 로그인 시간 업데이트
    const session = updateSessionLastLogin(sessionId);

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
  } catch (error: any) {
    return res.status(401).json({
      code: 401,
      data: [],
      message: 'Session authentication failed',
    });
  }
};