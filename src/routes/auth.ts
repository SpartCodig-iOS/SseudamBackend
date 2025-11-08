import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { generateTokenPair, verifyRefreshToken, LoginType } from '../services/jwtService';
import { createSession } from '../services/sessionService';

const router = Router();

/**
 * Supabase Admin 클라이언트
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있지 않습니다. Supabase 연동 기능이 비활성화됩니다.',
  );
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;


/**
 * 유틸: 응답 헬퍼
 */
function ok(data: any, message = 'OK') {
  return { code: 200, data, message };
}
function err(code: number, message: string) {
  return { code, message };
}

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: 사용자 회원가입
 *     description: Supabase Auth를 사용한 새 계정 생성
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *           example:
 *             email: "user@example.com"
 *             password: "password123"
 *             name: "홍길동"
 *     responses:
 *       200:
 *         description: 회원가입 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: 잘못된 요청 (필수 필드 누락)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "email and password are required"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "Supabase createUser failed"
 */
router.post('/signup', async (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.description = '사용자 회원가입 - Supabase Auth를 사용한 새 계정 생성'
  try {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return res.status(400).json(err(400, 'email and password are required'));
    }

    const lowerEmail = email.toLowerCase();

    // Supabase Auth 생성
    if (!supabase) {
      return res
        .status(500)
        .json(err(500, 'Supabase admin client is not configured (missing env vars)'));
    }

    const {
      data: { user },
      error: createErr,
    } = await supabase.auth.admin.createUser({
      email: lowerEmail,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createErr || !user) {
      return res
        .status(500)
        .json(err(500, `Supabase createUser failed: ${createErr?.message || 'unknown error'}`));
    }

    const authId = user.id;
    const username = (lowerEmail.split('@')[0] || `user_${authId.substring(0, 8)}`).toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);

    // Supabase Auth를 사용하므로 추가 DB 저장은 생략
    console.log(`[auth] User created in Supabase: ${authId}`);

    // 새로 생성된 사용자 정보로 JWT 토큰 생성
    const newUser = {
      id: authId,
      email: lowerEmail,
      name: name ?? null,
      avatar_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      username: username,
      password_hash: passwordHash, // 이미 해싱된 비밀번호 사용
    };

    const tokenPair = generateTokenPair(newUser, 'signup');
    const session = createSession(newUser, 'signup');

    return res.json(
      ok(
        {
          user: {
            id: authId,
            email: lowerEmail,
            name: name ?? null,
            avatarURL: null,
            createdAt: new Date().toISOString(),
            userId: username,
          },
          accessToken: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          accessTokenExpiresAt: tokenPair.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt.toISOString(),
          sessionId: session.sessionId,
          sessionExpiresAt: session.expiresAt,
        },
        'Signup successful',
      ),
    );
  } catch (e: any) {
    console.error('[auth] /signup error', e);
    return res.status(500).json(err(500, e?.message || 'Internal Server Error'));
  }
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: 사용자 로그인
 *     description: Supabase Auth를 통한 로그인 및 JWT 토큰 발급. email 필드에는 이메일 전체나 @ 앞 부분만 입력 가능
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "test"
 *             password: "password123"
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: 잘못된 요청 (필수 필드 누락)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "email/identifier and password are required"
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: "Invalid credentials"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "Supabase admin client is not configured"
 */
router.post('/login', async (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.description = '사용자 로그인 - Supabase Auth를 통한 로그인 및 JWT 토큰 발급'
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    // email 필드에 "이메일 또는 아이디"가 들어온다고 가정
    if (!email || !password) {
      return res.status(400).json(err(400, 'email and password are required'));
    }

    if (!supabase) {
      return res
        .status(500)
        .json(err(500, 'Supabase admin client is not configured (missing env vars)'));
    }

    const identRaw = email.trim().toLowerCase();
    let emailToUse = identRaw;
    let loginType: LoginType = 'email';

    // @ 없으면 아이디로 간주 → profiles에서 실제 이메일 찾기
    if (!identRaw.includes('@')) {
      loginType = 'username';
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('email, username')
        .or(`username.eq.${identRaw},email.ilike.${identRaw}@%`)
        .maybeSingle();

      console.log('[auth] login identRaw =', identRaw);
      console.log('[auth] login profile =', profile);
      console.log('[auth] login profileErr =', profileErr);

      if (profileErr) {
        console.error('[auth] login profiles query error', profileErr);
      }

      if (!profile?.email) {
        console.warn('[auth] login: no profile found for identRaw =', identRaw);
        return res.status(401).json(err(401, 'Invalid credentials'));
      }

      emailToUse = profile.email.toLowerCase();
    }

    console.log('[auth] login emailToUse for SupabaseAuth =', emailToUse);

    // Supabase Auth로 실제 로그인 시도
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    if (signInErr || !signInData?.user) {
      console.error('[auth] signInWithPassword error', signInErr);
      return res.status(401).json(err(401, 'Invalid credentials'));
    }

    const supabaseUser = signInData.user;

    // Supabase user를 UserRecord 비슷한 형식으로 변환
    const user = {
      id: supabaseUser.id,
      email: supabaseUser.email!,
      name: supabaseUser.user_metadata?.name || null,
      avatar_url: supabaseUser.user_metadata?.avatar_url || null,
      username: supabaseUser.email?.split('@')[0] || supabaseUser.id,
      password_hash: '', // 로그인 시에는 필요없음
      created_at: new Date(supabaseUser.created_at),
      updated_at: new Date(supabaseUser.updated_at || supabaseUser.created_at),
    };

    // JWT 토큰 생성 (기존에 쓰던 함수)
    const tokenPair = generateTokenPair(user, loginType);
    const session = createSession(user, loginType);

    return res.json(
      ok(
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarURL: user.avatar_url,
            createdAt: user.created_at.toISOString(),
            userId: user.username,
          },
          accessToken: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          accessTokenExpiresAt: tokenPair.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt.toISOString(),
          sessionId: session.sessionId,
          sessionExpiresAt: session.expiresAt,
        },
        'Login successful',
      ),
    );
  } catch (e: any) {
    console.error('[auth] /login error', e);
    return res.status(500).json(err(500, e?.message || 'Internal Server Error'));
  }
});

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: 액세스 토큰 재발급
 *     description: Refresh token을 사용하여 새로운 access token과 refresh token 쌍을 발급받습니다
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *           example:
 *             refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: 토큰 재발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Token refreshed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     refreshToken:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     accessTokenExpiresAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-12-01T12:00:00.000Z"
 *                     refreshTokenExpiresAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-12-08T12:00:00.000Z"
 *       400:
 *         description: 잘못된 요청 (refresh token 누락)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "refreshToken is required"
 *       401:
 *         description: 유효하지 않거나 만료된 refresh token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: "Invalid or expired refresh token"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "Supabase admin client is not configured"
 */
router.post('/refresh', async (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.description = '액세스 토큰 재발급 - Refresh token을 사용하여 새로운 토큰 발급'
  try {
    const { refreshToken } = req.body as {
      refreshToken?: string;
    };

    if (!refreshToken) {
      return res.status(400).json(err(400, 'refreshToken is required'));
    }

    // Refresh token 검증
    const payload = verifyRefreshToken(refreshToken);
    if (!payload.sub) {
      return res.status(401).json(err(401, 'Invalid refresh token'));
    }

    // Supabase에서 사용자 정보 조회 (혹은 JWT payload에서 기본 정보 사용)
    let user;

    try {
      if (supabase) {
        const { data: supabaseUser, error: getUserErr } = await supabase.auth.admin.getUserById(payload.sub);
        if (getUserErr || !supabaseUser.user) {
          return res.status(401).json(err(401, 'User not found in Supabase'));
        }

        user = {
          id: supabaseUser.user.id,
          email: supabaseUser.user.email!,
          name: supabaseUser.user.user_metadata?.name || null,
          avatar_url: supabaseUser.user.user_metadata?.avatar_url || null,
          username: supabaseUser.user.email?.split('@')[0] || supabaseUser.user.id,
          password_hash: '',
          created_at: new Date(supabaseUser.user.created_at),
          updated_at: new Date(supabaseUser.user.updated_at || supabaseUser.user.created_at),
        };
      } else {
        return res.status(500).json(err(500, 'Supabase admin client is not configured'));
      }
    } catch (error) {
      console.error('[auth] /refresh error during user lookup:', error);
      return res.status(401).json(err(401, 'User verification failed'));
    }

    // 새로운 토큰 쌍 생성
    const tokenPair = generateTokenPair(user);
    const session = createSession(user, 'email'); // refresh 시에는 기본적으로 email 타입으로

    return res.json(
      ok(
        {
          accessToken: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          accessTokenExpiresAt: tokenPair.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt.toISOString(),
          sessionId: session.sessionId,
          sessionExpiresAt: session.expiresAt,
        },
        'Token refreshed successfully',
      ),
    );
  } catch (e: any) {
    console.error('[auth] /refresh error', e);
    if (e.name === 'TokenExpiredError' || e.name === 'JsonWebTokenError') {
      return res.status(401).json(err(401, 'Invalid or expired refresh token'));
    }
    return res.status(500).json(err(500, e?.message || 'Internal Server Error'));
  }
});

/**
 * @swagger
 * /api/v1/auth/session:
 *   get:
 *     summary: 현재 세션 로그인 정보 조회
 *     description: 현재 세션의 로그인 타입, 최근 로그인 시간 등을 조회합니다
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 세션 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Session info retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     loginType:
 *                       type: string
 *                       example: "email"
 *                       description: "로그인 방식 (email, username, signup)"
 *                     lastLoginAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-09T05:58:33.452Z"
 *                       description: "최근 로그인 시간"
 *                     userId:
 *                       type: string
 *                       example: "60be2b70-65cf-4a90-a188-c8f967e1cbe7"
 *                     email:
 *                       type: string
 *                       example: "test@example.com"
 *       401:
 *         description: 인증 토큰이 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 */
router.get('/session', (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.summary = '현재 세션 로그인 정보 조회'
  // #swagger.description = '현재 세션의 로그인 타입, 최근 로그인 시간 등을 조회합니다'
  // #swagger.security = [{ "bearerAuth": [] }]
  /* #swagger.responses[200] = {
        description: '세션 정보 조회 성공',
        schema: {
          type: 'object',
          example: {
            "code": 200,
            "data": {
              "loginType": "email",
              "lastLoginAt": "2025-11-09T05:58:33.452Z",
              "userId": "60be2b70-65cf-4a90-a188-c8f967e1cbe7",
              "email": "test@example.com"
            },
            "message": "Session info retrieved successfully"
          }
        }
      }
  */
  /* #swagger.responses[401] = {
        description: '인증 토큰이 유효하지 않음',
        schema: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 401 },
            message: { type: 'string', example: 'Unauthorized' }
          }
        }
      }
  */

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(err(401, 'Authorization header required'));
    }

    const token = authHeader.substring(7);
    const { verifyAccessToken } = require('../services/jwtService');
    const payload = verifyAccessToken(token);

    return res.json(
      ok(
        {
          loginType: payload.loginType || 'unknown',
          lastLoginAt: payload.lastLoginAt || null,
          userId: payload.sub,
          email: payload.email,
        },
        'Session info retrieved successfully'
      )
    );
  } catch (e: any) {
    console.error('[auth] /session error', e);
    if (e.name === 'TokenExpiredError' || e.name === 'JsonWebTokenError') {
      return res.status(401).json(err(401, 'Invalid or expired token'));
    }
    return res.status(500).json(err(500, e?.message || 'Internal Server Error'));
  }
});

export default router;