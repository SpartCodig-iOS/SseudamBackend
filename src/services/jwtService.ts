import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
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
}

interface AccessPayload extends JwtPayload {
  sub: string;
  email: string;
  name?: string | null;
}

const secondsToMs = (value: number): number => value * 1000;

const createAccessPayload = (user: UserRecord): AccessPayload => ({
  sub: user.id,
  email: user.email,
  name: user.name ?? undefined,
});

const createRefreshPayload = (user: UserRecord): RefreshPayload => ({
  sub: user.id,
  typ: 'refresh',
});

export const generateTokenPair = (user: UserRecord): TokenPair => {
  const accessExpiresAt = new Date(Date.now() + secondsToMs(env.accessTokenTTL));
  const refreshExpiresAt = new Date(Date.now() + secondsToMs(env.refreshTokenTTL));

  const accessToken = jwt.sign(createAccessPayload(user), env.jwtSecret, {
    expiresIn: env.accessTokenTTL,
  });
  const refreshToken = jwt.sign(createRefreshPayload(user), env.jwtSecret, {
    expiresIn: env.refreshTokenTTL,
  });

  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt,
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt,
  };
};

export const verifyAccessToken = (token: string): AccessPayload => {
  return jwt.verify(token, env.jwtSecret) as AccessPayload;
};

export const verifyRefreshToken = (token: string): RefreshPayload => {
  const payload = jwt.verify(token, env.jwtSecret) as RefreshPayload;
  if (payload.typ !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return payload;
};
