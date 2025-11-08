import { Router } from 'express';
import { countUsers } from '../utils/userRepository';
import { success } from '../types/api';

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
router.get('/health', async (_req, res, next) => {
  // #swagger.tags = ['Health']
  // #swagger.description = '서버 상태 체크'
  try {
    await countUsers();
    res.json(success({ status: 'ok', database: 'ok' }));
  } catch (error) {
    console.error('Database health check failed', error);
    res.json(success({ status: 'ok', database: 'unavailable' }));
  }
});

export default router;
