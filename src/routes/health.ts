// src/routes/health.ts
import { Router } from 'express';
import { success } from '../types/api';
import { supabase } from '../utils/supabaseClient';

const router = Router();

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

  let dbStatus: 'ok' | 'unavailable' | 'not_configured' = 'ok';

  try {
    if (!supabase) {
      dbStatus = 'not_configured';
    } else {
      const table = process.env.SUPABASE_PROFILE_TABLE || 'profiles';

      const { error } = await supabase
        .from(table)
        .select('id', { head: true, count: 'exact' });

      if (error) {
        console.error('[health] Supabase health check error', error);
        dbStatus = 'unavailable';
      }
    }
  } catch (error) {
    console.error('Database health check failed', error);
    dbStatus = 'unavailable';
  }

  return res.json(
    success({
      status: 'ok',
      database: dbStatus,
    }),
  );
});

export default router;