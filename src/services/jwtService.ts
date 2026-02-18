import { Injectable } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { LoginType } from '../types/auth';
import { UserRecord, UserRole } from '../types/user';

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

interface RefreshPayload extends JwtPayload {
  sub: string;
  typ: string;
  sessionId: string;
}

export interface AccessPayload extends JwtPayload {
  sub: string;
  email: string;
  name?: string | null;
  loginType?: LoginType;
  lastLoginAt?: string;
  role?: UserRole;
  sessionId: string;
}

const secondsToMs = (value: number): number => value * 1000;

@Injectable()
export class JwtTokenService {
  private createAccessPayload(user: UserRecord, sessionId: string, loginType?: LoginType): AccessPayload {
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

  private createRefreshPayload(user: UserRecord, sessionId: string): RefreshPayload {
    return {
      sub: user.id,
      typ: 'refresh',
      sessionId,
    };
  }

  generateTokenPair(user: UserRecord, loginType: LoginType | undefined, sessionId: string): TokenPair {
    console.log(`🔍 ENV DEBUG - ACCESS_TOKEN_TTL_SECONDS: ${process.env.ACCESS_TOKEN_TTL_SECONDS}`);
    console.log(`🔍 ENV DEBUG - Parsed accessTokenTTL: ${env.accessTokenTTL} seconds (${env.accessTokenTTL/3600} hours)`);

    const accessExpiresAt = new Date(Date.now() + secondsToMs(env.accessTokenTTL));
    const refreshExpiresAt = new Date(Date.now() + secondsToMs(env.refreshTokenTTL));

    const accessToken = jwt.sign(this.createAccessPayload(user, sessionId, loginType), env.jwtSecret, {
      expiresIn: env.accessTokenTTL,
    });
    const refreshToken = jwt.sign(this.createRefreshPayload(user, sessionId), env.jwtSecret, {
      expiresIn: env.refreshTokenTTL,
    });

    return {
      accessToken,
      accessTokenExpiresAt: accessExpiresAt,
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt,
    };
  }

  verifyAccessToken(token: string): AccessPayload {
    return jwt.verify(token, env.jwtSecret) as AccessPayload;
  }

  verifyRefreshToken(token: string): RefreshPayload {
    const payload = jwt.verify(token, env.jwtSecret) as RefreshPayload;
    if (payload.typ !== 'refresh') {
      throw new Error('Invalid refresh token');
    }
    return payload;
  }

  // 임시 무한토큰 생성 (TODO: 나중에 제거 예정)
  generateInfiniteToken(user: UserRecord, sessionId: string): string {
    // 임시로 모든 환경에서 허용 (나중에 제거 예정)
    // if (env.nodeEnv !== 'development') {
    //   throw new Error('Infinite tokens are only allowed in development environment');
    // }

    const payload: AccessPayload = {
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
      loginType: 'email',
      lastLoginAt: new Date().toISOString(),
      role: user.role,
      sessionId,
    };

    // expiresIn을 설정하지 않으면 무한토큰이 됨
    return jwt.sign(payload, env.jwtSecret);
  }
}
