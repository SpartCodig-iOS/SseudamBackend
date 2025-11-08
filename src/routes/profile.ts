import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { success } from '../types/api';
import { toProfileResponse, toUserResponse } from '../utils/mappers';
import { deleteUser } from '../utils/userRepository';
import { supabaseService } from '../services/supabaseService';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: 현재 사용자 정보 조회
 *     description: 인증된 사용자의 기본 정보를 조회합니다
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 사용자 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserEnvelope'
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
router.get('/me', authenticate, (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.summary = '현재 사용자 정보 조회'
  // #swagger.description = '인증된 사용자의 기본 정보를 조회합니다'
  // #swagger.security = [{ "bearerAuth": [] }]
  /* #swagger.responses[200] = {
        description: '사용자 정보 조회 성공',
        schema: {
          type: 'object',
          example: {
            "code": 200,
            "data": {
              "id": "60be2b70-65cf-4a90-a188-c8f967e1cbe7",
              "email": "test@example.com",
              "name": "테스트 사용자",
              "avatarURL": null,
              "createdAt": "2025-11-07T20:43:21.842Z",
              "userId": "test"
            },
            "message": "OK"
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
  res.json(success(toUserResponse(req.currentUser!)));
});

/**
 * @swagger
 * /api/v1/profile:
 *   get:
 *     summary: 사용자 프로필 조회
 *     description: 인증된 사용자의 상세 프로필 정보를 조회합니다
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 프로필 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProfileEnvelope'
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
router.get('/profile', authenticate, (req, res) => {
  // #swagger.tags = ['Profile']
  // #swagger.description = '사용자 프로필 조회'
  // #swagger.security = [{ "bearerAuth": [] }]
  /* #swagger.responses[200] = {
        description: '프로필 정보 조회 성공',
        schema: {
          type: 'object',
          example: {
            "code": 200,
            "data": {
              "id": "60be2b70-65cf-4a90-a188-c8f967e1cbe7",
              "email": "test@example.com",
              "name": "테스트 사용자",
              "avatarURL": null,
              "createdAt": "2025-11-07T20:43:21.842Z",
              "userId": "test"
            },
            "message": "OK"
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
  res.json(success(toProfileResponse(req.currentUser!)));
});

/**
 * @swagger
 * /api/v1/profile:
 *   delete:
 *     summary: 사용자 계정 삭제
 *     description: 인증된 사용자의 계정을 삭제합니다. purge=supabase 쿼리 파라미터로 Supabase Auth 계정도 함께 삭제할 수 있습니다
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 계정 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteEnvelope'
 *             examples:
 *               withSupabase:
 *                 summary: Supabase 포함 삭제
 *                 value:
 *                   code: 200
 *                   message: "Account deleted (supabase only)"
 *                   data:
 *                     userID: "123e4567-e89b-12d3-a456-426614174000"
 *                     supabaseDeleted: true
 *               localOnly:
 *                 summary: 로컬만 삭제
 *                 value:
 *                   code: 200
 *                   message: "Account deletion logged (local DB not configured)"
 *                   data:
 *                     userID: "123e4567-e89b-12d3-a456-426614174000"
 *                     supabaseDeleted: false
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
 *                   example: "Internal Server Error"
 */
router.delete('/profile', authenticate, async (req, res, next) => {
  // #swagger.tags = ['Profile']
  // #swagger.description = '사용자 계정 삭제 (Supabase Auth 자동 삭제 포함)'
  // #swagger.security = [{ "bearerAuth": [] }]
  /* #swagger.responses[200] = {
        description: '계정 삭제 성공',
        schema: {
          type: 'object',
          example: {
            "code": 200,
            "data": {
              "userID": "60be2b70-65cf-4a90-a188-c8f967e1cbe7",
              "supabaseDeleted": true
            },
            "message": "Account deleted successfully"
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
  /* #swagger.responses[500] = {
        description: '서버 오류',
        schema: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 500 },
            message: { type: 'string', example: 'Internal Server Error' }
          }
        }
      }
  */
  try {
    const user = req.currentUser!;

    // 자동으로 Supabase까지 삭제 (purge 파라미터 불필요)
    let supabaseDeleted = false;
    try {
      await supabaseService.deleteUser(user.id); // Supabase Auth 관리자 삭제
      supabaseDeleted = true;
    } catch (error: any) {
      const message = (error?.message as string)?.toLowerCase() ?? '';
      if (!message.includes('not found')) {
        throw error;
      }
    }

    // PostgreSQL 제거로 인해 로컬 DB 삭제는 생략
    // await deleteUser(user.id); // 로컬 DB 삭제
    console.log(`[profile] User deletion completed: ${user.id}, supabaseDeleted: ${supabaseDeleted}`);

    res.json(
      success(
        { userID: user.id, supabaseDeleted },
        'Account deleted successfully'
      )
    );
  } catch (error) {
    next(error);
  }
});

export default router;
