import { Router } from 'express';
import authRoutes  from './auth';
import profileRoutes from './profile';
import sessionRoutes from './session';

const router = Router();

router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/auth', profileRoutes);
router.use('/api/v1/session', sessionRoutes);

export default router;
