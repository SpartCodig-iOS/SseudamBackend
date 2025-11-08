"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const api_1 = require("../types/api");
const mappers_1 = require("../utils/mappers");
const supabaseService_1 = require("../services/supabaseService");
const router = (0, express_1.Router)();
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
router.get('/me', authenticate_1.authenticate, (req, res) => {
    // #swagger.tags = ['Auth']
    // #swagger.description = '현재 사용자 정보 조회'
    // #swagger.security = [{ "bearerAuth": [] }]
    res.json((0, api_1.success)((0, mappers_1.toUserResponse)(req.currentUser)));
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
router.get('/profile', authenticate_1.authenticate, (req, res) => {
    // #swagger.tags = ['Profile']
    // #swagger.description = '사용자 프로필 조회'
    // #swagger.security = [{ "bearerAuth": [] }]
    res.json((0, api_1.success)((0, mappers_1.toProfileResponse)(req.currentUser)));
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
 *     parameters:
 *       - in: query
 *         name: purge
 *         schema:
 *           type: string
 *           enum: [supabase]
 *         description: Supabase Auth 계정도 함께 삭제할지 여부
 *         example: supabase
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
router.delete('/profile', authenticate_1.authenticate, async (req, res, next) => {
    // #swagger.tags = ['Profile']
    // #swagger.description = '사용자 계정 삭제'
    // #swagger.security = [{ "bearerAuth": [] }]
    try {
        const user = req.currentUser;
        // 옵션: 쿼리스트링으로 Supabase까지 삭제할지 제어 (?purge=supabase)
        const purgeSupabase = String(req.query.purge ?? '').toLowerCase() === 'supabase';
        let supabaseDeleted = false;
        if (purgeSupabase) {
            try {
                await supabaseService_1.supabaseService.deleteUser(user.id); // Supabase Auth 관리자 삭제
                supabaseDeleted = true;
            }
            catch (error) {
                const message = error?.message?.toLowerCase() ?? '';
                if (!message.includes('not found')) {
                    throw error;
                }
            }
        }
        // PostgreSQL 제거로 인해 로컬 DB 삭제는 생략
        // await deleteUser(user.id); // 로컬 DB 삭제
        console.log(`[profile] User deletion requested: ${user.id}, supabaseDeleted: ${supabaseDeleted}`);
        res.json((0, api_1.success)({ userID: user.id, supabaseDeleted }, purgeSupabase ? 'Account deleted (supabase only)' : 'Account deletion logged (local DB not configured)'));
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
