import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { success } from '../types/api';
import { toProfileResponse, toUserResponse } from '../utils/mappers';
import { verifyAccessToken } from '../services/jwtService';

const router = Router();


/**
 * @swagger
 * /api/v1/profile/me:
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
router.get('/me', authenticate, (req, res) => {
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
              "userId": "test",
              "loginType": "email"
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

  // JWT 토큰에서 loginType 가져오기
  let loginType = 'email'; // 기본값
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const payload = verifyAccessToken(token);
        if (payload?.loginType) {
          loginType = payload.loginType;
        }
      }
    }
  } catch (error) {
    // 에러가 발생해도 기본값 사용
    console.debug('Failed to extract loginType from token:', error);
  }

  const profileData = {
    ...toProfileResponse(req.currentUser!),
    loginType
  };

  res.json(success(profileData));
});

export default router;
