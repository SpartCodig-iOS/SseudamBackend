import { Injectable } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { LoginType } from '../types/auth';
import { UserRecord } from '../types/user';

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
}
