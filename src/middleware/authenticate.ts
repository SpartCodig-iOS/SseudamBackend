import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/jwtService';
import { findByEmail, findById } from '../utils/userRepository';
import { supabaseService } from '../services/supabaseService';
import { UserRecord } from '../types/user';

declare global {
  namespace Express {
    interface Request {
      currentUser?: UserRecord;
    }
  }
}

const extractBearer = (authHeader?: string | null): string | null => {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ code: 401, message: 'Missing bearer token' });
  }

  try {
    // 로컬 JWT 검증 - Supabase Auth 없이 생성된 토큰용
    const payload = verifyAccessToken(token);
    if (payload?.sub && payload?.email) {
      // JWT payload에서 직접 UserRecord 생성
      const user: UserRecord = {
        id: payload.sub,
        email: payload.email,
        name: payload.name || null,
        avatar_url: null,
        username: payload.email.split('@')[0] || payload.sub,
        password_hash: '', // 인증 후에는 필요없음
        created_at: new Date((payload.iat || Math.floor(Date.now() / 1000)) * 1000), // iat를 생성 시간으로 사용
        updated_at: new Date((payload.iat || Math.floor(Date.now() / 1000)) * 1000),
      };
      req.currentUser = user;
      return next();
    }
  } catch (error) {
    console.debug('Local JWT verification failed:', (error as Error).message);
  }

  try {
    // Supabase 토큰 검증 (fallback)
    const supabaseUser = await supabaseService.getUserFromToken(token);
    if (supabaseUser?.email) {
      const user: UserRecord = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.name || null,
        avatar_url: supabaseUser.user_metadata?.avatar_url || null,
        username: supabaseUser.email.split('@')[0] || supabaseUser.id,
        password_hash: '',
        created_at: new Date(supabaseUser.created_at),
        updated_at: new Date(supabaseUser.updated_at || supabaseUser.created_at),
      };
      req.currentUser = user;
      return next();
    }
  } catch (error) {
    console.debug('Supabase token verification failed:', (error as Error).message);
  }

  return res.status(401).json({ code: 401, message: 'Unauthorized' });
};
