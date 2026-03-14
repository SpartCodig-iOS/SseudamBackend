import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService, SessionRecord } from '../auth/services/sessionService';
import { CacheService } from '../cache-shared/services/cacheService';
import { LoginType } from '../../types/auth';
import { UserRecord } from '../../types/user';

export interface SessionInfo {
  userId: string;
  sessionId: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: number;
  createdAt: number;
  lastAccessAt: number;
}

export interface AuthSession {
  userId: string;
  sessionId: string;
  role?: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface AuthSessionPayload {
  userId: string;
  sessionId: string;
  role?: string;
  permissions?: string[];
  loginType?: string;
  email?: string;
  iat?: number;
  exp?: number;
  // Extended properties for auth response
  user?: UserRecord;
  tokenPair?: TokenPair;
  session?: SessionRecord;
}

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);
  private readonly SESSION_PREFIX = 'auth_session:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';

  constructor(
    private readonly sessionService: SessionService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 인증 세션 생성
   */
  async createAuthSession(
    userId: string,
    sessionData: Partial<AuthSession>,
    ttl: number = 3600 // 기본 1시간
  ): Promise<string> {
    try {
      const sessionRecord = await this.sessionService.createSession(
        userId,
        (sessionData.metadata?.loginType as LoginType) || 'email'
      );

      const authSession: AuthSession = {
        userId,
        sessionId: sessionRecord.sessionId,
        role: sessionData.role,
        permissions: sessionData.permissions || [],
        metadata: sessionData.metadata || {},
      };

      // 인증 세션 캐시에 저장
      await this.cacheService.set(
        `${this.SESSION_PREFIX}${sessionRecord.sessionId}`,
        authSession,
        { ttl }
      );

      // 사용자별 세션 목록에 추가
      await this.addToUserSessions(userId, sessionRecord.sessionId, ttl);

      this.logger.debug(`Auth session created: ${sessionRecord.sessionId} for user: ${userId}`);
      return sessionRecord.sessionId;
    } catch (error) {
      this.logger.error(`Failed to create auth session for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 인증 세션 조회
   */
  async getAuthSession(sessionId: string): Promise<AuthSession | null> {
    try {
      const authSession = await this.cacheService.get<AuthSession>(
        `${this.SESSION_PREFIX}${sessionId}`
      );

      if (!authSession) {
        return null;
      }

      // 세션 활성 시간 업데이트
      await this.touchSession(sessionId);

      return authSession;
    } catch (error) {
      this.logger.error(`Failed to get auth session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * 인증 세션 업데이트
   */
  async updateAuthSession(
    sessionId: string,
    updates: Partial<AuthSession>
  ): Promise<void> {
    try {
      const existingSession = await this.getAuthSession(sessionId);
      if (!existingSession) {
        throw new Error('Auth session not found');
      }

      const updatedSession: AuthSession = {
        ...existingSession,
        ...updates,
      };

      // TTL 유지를 위해 기존 TTL 조회
      const currentTtl = await this.getSessionTtl(sessionId);
      const ttl = currentTtl > 0 ? currentTtl : 3600;

      await this.cacheService.set(
        `${this.SESSION_PREFIX}${sessionId}`,
        updatedSession,
        { ttl }
      );

      this.logger.debug(`Auth session updated: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to update auth session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * 인증 세션 삭제
   */
  async deleteAuthSession(sessionId: string): Promise<void> {
    try {
      const authSession = await this.cacheService.get<AuthSession>(
        `${this.SESSION_PREFIX}${sessionId}`
      );

      if (authSession) {
        // 사용자별 세션 목록에서 제거
        await this.removeFromUserSessions(authSession.userId, sessionId);
      }

      // 캐시에서 세션 삭제
      await this.cacheService.del(`${this.SESSION_PREFIX}${sessionId}`);

      // 기본 세션 서비스에서도 삭제
      await this.sessionService.deleteSession(sessionId);

      this.logger.debug(`Auth session deleted: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete auth session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * 사용자의 모든 인증 세션 삭제
   */
  async deleteAllUserSessions(userId: string): Promise<number> {
    try {
      const sessionIds = await this.getUserSessionIds(userId);
      let deletedCount = 0;

      for (const sessionId of sessionIds) {
        await this.deleteAuthSession(sessionId);
        deletedCount++;
      }

      // 사용자 세션 목록 정리
      await this.cacheService.del(`${this.USER_SESSIONS_PREFIX}${userId}`);

      this.logger.log(`Deleted ${deletedCount} auth sessions for user: ${userId}`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to delete all sessions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 세션 활성 시간 업데이트
   */
  async touchSession(sessionId: string): Promise<void> {
    try {
      // 기본 세션 서비스의 touch 기능 사용
      await this.sessionService.touchSession(sessionId);
    } catch (error) {
      this.logger.debug(`Failed to touch session ${sessionId}:`, error);
    }
  }

  /**
   * 세션 권한 확인
   */
  async hasPermission(sessionId: string, permission: string): Promise<boolean> {
    try {
      const authSession = await this.getAuthSession(sessionId);
      if (!authSession) {
        return false;
      }

      return authSession.permissions?.includes(permission) || false;
    } catch (error) {
      this.logger.error(`Failed to check permission for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 세션 역할 확인
   */
  async hasRole(sessionId: string, role: string): Promise<boolean> {
    try {
      const authSession = await this.getAuthSession(sessionId);
      if (!authSession) {
        return false;
      }

      return authSession.role === role;
    } catch (error) {
      this.logger.error(`Failed to check role for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 사용자별 세션 목록에 추가
   */
  private async addToUserSessions(
    userId: string,
    sessionId: string,
    ttl: number
  ): Promise<void> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessions = (await this.cacheService.get<string[]>(userSessionsKey)) || [];

      if (!sessions.includes(sessionId)) {
        sessions.push(sessionId);
        await this.cacheService.set(userSessionsKey, sessions, { ttl });
      }
    } catch (error) {
      this.logger.warn(`Failed to add session to user sessions:`, error);
    }
  }

  /**
   * 사용자별 세션 목록에서 제거
   */
  private async removeFromUserSessions(userId: string, sessionId: string): Promise<void> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessions = (await this.cacheService.get<string[]>(userSessionsKey)) || [];

      const updatedSessions = sessions.filter(id => id !== sessionId);

      if (updatedSessions.length === 0) {
        await this.cacheService.del(userSessionsKey);
      } else {
        // 기존 TTL 유지
        const ttl = await this.getSessionTtl(sessionId) || 3600;
        await this.cacheService.set(userSessionsKey, updatedSessions, { ttl });
      }
    } catch (error) {
      this.logger.warn(`Failed to remove session from user sessions:`, error);
    }
  }

  /**
   * 사용자 세션 ID 목록 조회
   */
  private async getUserSessionIds(userId: string): Promise<string[]> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      return (await this.cacheService.get<string[]>(userSessionsKey)) || [];
    } catch (error) {
      this.logger.error(`Failed to get user session IDs for ${userId}:`, error);
      return [];
    }
  }

  /**
   * 세션 TTL 조회
   */
  private async getSessionTtl(sessionId: string): Promise<number> {
    try {
      // CacheService에 getTtl 메서드가 있다고 가정
      // 없는 경우 기본값 반환
      return 3600; // 1시간 기본값
    } catch (error) {
      return 3600;
    }
  }

  /**
   * 인증 세션 통계 조회
   */
  async getSessionStats(): Promise<{
    totalActiveSessions: number;
    sessionsByUser: Record<string, number>;
  }> {
    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const sessionKeys = await this.cacheService.scanKeys(pattern);
      const sessionsByUser: Record<string, number> = {};

      for (const key of sessionKeys) {
        const session = await this.cacheService.get<AuthSession>(key);
        if (session) {
          sessionsByUser[session.userId] = (sessionsByUser[session.userId] || 0) + 1;
        }
      }

      return {
        totalActiveSessions: sessionKeys.length,
        sessionsByUser,
      };
    } catch (error) {
      this.logger.error('Failed to get session stats:', error);
      return {
        totalActiveSessions: 0,
        sessionsByUser: {},
      };
    }
  }

  /**
   * 만료된 세션 정리
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      let cleanedCount = 0;
      const pattern = `${this.SESSION_PREFIX}*`;
      const sessionKeys = await this.cacheService.scanKeys(pattern);

      for (const key of sessionKeys) {
        const session = await this.cacheService.get<AuthSession>(key);
        if (!session) {
          await this.cacheService.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired auth sessions`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }
}