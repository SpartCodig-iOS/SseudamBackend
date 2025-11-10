import { Router } from 'express';
import { success } from '../types/api';
import { getSession, updateSessionLastLogin } from '../services/sessionService';

const router = Router();

/**
 * @swagger
 * /api/v1/session:
 *   get:
 *     summary: 현재 세션 로그인 정보 조회
 *     description: 현재 세션의 로그인 타입, 최근 로그인 시간 등을 조회합니다
 *     tags: [Session]
 *     parameters:
 *       - in: header
 *         name: X-Session-ID
 *         required: true
 *         schema:
 *           type: string
 *         description: 세션 ID
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     loginType:
 *                       type: string
 *                       example: "email"
 *                       description: "로그인 타입 (email, username, signup)"
 *                     lastLoginAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-08T20:39:05.084Z"
 *                       description: "최근 로그인 시간"
 *                     userId:
 *                       type: string
 *                       example: "f22fc114-8dc4-4b0a-a77a-559e2abbad80"
 *                       description: "사용자 ID"
 *                     email:
 *                       type: string
 *                       example: "testuser@example.com"
 *                       description: "사용자 이메일"
 *                 message:
 *                   type: string
 *                   example: "Session info retrieved successfully"
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
 *                 data:
 *                   type: array
 *                   items: {}
 *                   example: []
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 */
router.get('/', (req, res) => {
  // #swagger.tags = ['Session']
  // #swagger.summary = '현재 세션 로그인 정보 조회'
  // #swagger.description = '세션 ID를 파라미터로 받아 세션 정보를 조회합니다'
  // #swagger.parameters['sessionId'] = { in: 'query', name: 'sessionId', required: true, type: 'string', description: '세션 ID' }
  /* #swagger.responses[200] = {
        description: '세션 정보 조회 성공',
        schema: {
          type: 'object',
          example: {
            "code": 200,
            "data": {
              "loginType": "email",
              "lastLoginAt": "2025-11-08T20:39:05.084Z",
              "userId": "f22fc114-8dc4-4b0a-a77a-559e2abbad80",
              "email": "testuser@example.com",
              "sessionId": "c46760962b6433f148963bd6645d1b6e5c342a41178dbfc66cfb75aa8bb03c48",
              "createdAt": "2025-11-09T05:55:28.259Z",
              "expiresAt": "2025-11-10T05:55:28.259Z"
            },
            "message": "Session info retrieved successfully"
          }
        }
      }
  */
  /* #swagger.responses[400] = {
        description: '세션 ID 파라미터가 누락됨',
        schema: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 400 },
            data: { type: 'array', items: {}, example: [] },
            message: { type: 'string', example: 'Session ID parameter is required' }
          }
        }
      }
  */
  /* #swagger.responses[401] = {
        description: '세션이 유효하지 않음',
        schema: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 401 },
            data: { type: 'array', items: {}, example: [] },
            message: { type: 'string', example: 'Invalid or expired session' }
          }
        }
      }
  */

  try {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({
        code: 400,
        data: [],
        message: 'Session ID parameter is required',
      });
    }

    // 세션 정보 조회 및 lastLoginAt 업데이트
    const session = updateSessionLastLogin(sessionId);

    if (!session) {
      return res.status(401).json({
        code: 401,
        data: [],
        message: 'Invalid or expired session',
      });
    }

    return res.json(success({
      loginType: session.loginType || 'unknown',
      lastLoginAt: session.lastLoginAt || null,
      userId: session.userId,
      email: session.email,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }, 'Session info retrieved successfully'));
  } catch (error: any) {
    return res.status(500).json({
      code: 500,
      data: [],
      message: 'Internal server error',
    });
  }
});

export default router;