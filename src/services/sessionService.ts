import { randomBytes } from 'crypto';
import { UserRecord } from '../types/user';
import { LoginType } from './jwtService';

export interface SessionData {
  sessionId: string;
  userId: string;
  email: string;
  name?: string | null;
  loginType: LoginType;
  lastLoginAt: string;
  createdAt: string;
  expiresAt: string;
}

// 인메모리 세션 저장소 (실제 운영에서는 Redis 등을 사용)
const sessions = new Map<string, SessionData>();

// 세션 ID 생성
const generateSessionId = (): string => {
  return randomBytes(32).toString('hex');
};

// 세션 생성
export const createSession = (user: UserRecord, loginType: LoginType, ttlMinutes = 1440): SessionData => {
  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000); // 24시간 (1440분) 기본

  const sessionData: SessionData = {
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

// 세션 조회
export const getSession = (sessionId: string): SessionData | null => {
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

// 세션 갱신 (마지막 로그인 시간 업데이트)
export const updateSessionLastLogin = (sessionId: string): SessionData | null => {
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

// 세션 삭제 (로그아웃)
export const deleteSession = (sessionId: string): boolean => {
  return sessions.delete(sessionId);
};

// 사용자의 모든 세션 삭제
export const deleteUserSessions = (userId: string): number => {
  let deleted = 0;
  for (const [sessionId, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(sessionId);
      deleted++;
    }
  }
  return deleted;
};

// 만료된 세션들 정리
export const cleanExpiredSessions = (): number => {
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

// 현재 활성 세션 수 반환
export const getActiveSessionCount = (): number => {
  return sessions.size;
};