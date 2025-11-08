"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/health.ts
const express_1 = require("express");
const api_1 = require("../types/api");
const supabaseClient_1 = require("../utils/supabaseClient");
const router = (0, express_1.Router)();
/**
 * @swagger
 * /health:
 *   get:
 *     summary: 서비스 상태 확인
 *     description: 서버와 데이터베이스 상태를 확인합니다
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서비스 상태 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 data:
 *                   $ref: '#/components/schemas/HealthStatus'
 *             example:
 *               code: 200
 *               data:
 *                 status: "ok"
 *                 database: "ok"
 */
router.get('/health', async (_req, res, _next) => {
    // #swagger.tags = ['Health']
    // #swagger.description = '서버 상태 체크'
    let dbStatus = 'ok';
    try {
        if (!supabaseClient_1.supabase) {
            dbStatus = 'not_configured';
        }
        else {
            const table = process.env.SUPABASE_PROFILE_TABLE || 'profiles';
            const { error } = await supabaseClient_1.supabase
                .from(table)
                .select('id', { head: true, count: 'exact' });
            if (error) {
                console.error('[health] Supabase health check error', error);
                dbStatus = 'unavailable';
            }
        }
    }
    catch (error) {
        console.error('Database health check failed', error);
        dbStatus = 'unavailable';
    }
    return res.json((0, api_1.success)({
        status: 'ok',
        database: dbStatus,
    }));
});
exports.default = router;
