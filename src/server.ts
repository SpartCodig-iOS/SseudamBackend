import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

const start = async () => {
  try {
    app.listen(env.port, () => {
      logger.info('Server listening', { port: env.port, env: env.nodeEnv });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error)?.message });
    process.exit(1);
  }
};

start();
