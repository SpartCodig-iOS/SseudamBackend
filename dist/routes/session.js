"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sessionAuth_1 = require("../middleware/sessionAuth");
const api_1 = require("../types/api");
const router = (0, express_1.Router)();
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
router.get('/', sessionAuth_1.sessionAuthenticate, (req, res) => {
    // #swagger.tags = ['Session']
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
                "lastLoginAt": "2025-11-08T20:39:05.084Z",
                "userId": "f22fc114-8dc4-4b0a-a77a-559e2abbad80",
                "email": "testuser@example.com"
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
              data: { type: 'array', items: {}, example: [] },
              message: { type: 'string', example: 'Unauthorized' }
            }
          }
        }
    */
    try {
        // 세션 정보는 이미 sessionAuthenticate 미들웨어에서 req.session에 설정됨
        if (!req.session) {
            return res.status(401).json({
                code: 401,
                data: [],
                message: 'Session not found',
            });
        }
        return res.json((0, api_1.success)({
            loginType: req.session.loginType || 'unknown',
            lastLoginAt: req.session.lastLoginAt || null,
            userId: req.session.userId,
            email: req.session.email,
            sessionId: req.session.sessionId,
            createdAt: req.session.createdAt,
            expiresAt: req.session.expiresAt,
        }, 'Session info retrieved successfully'));
    }
    catch (error) {
        return res.status(401).json({
            code: 401,
            data: [],
            message: 'Session authentication failed',
        });
    }
});
exports.default = router;
