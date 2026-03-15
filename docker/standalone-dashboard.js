const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const Queue = require('bull');

// Express 앱 생성
const app = express();
const port = process.env.PORT || 3001;

// Redis 연결 설정
const redisConnection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  keyPrefix: 'sseudam:',
};

console.log('🔗 Redis 연결 설정:', {
  host: redisConnection.host,
  port: redisConnection.port,
  hasPassword: !!redisConnection.password,
});

// BullMQ 큐들 생성
const queues = [
  { name: 'notification', displayName: 'Notification Queue' },
  { name: 'settlement', displayName: 'Settlement Queue' },
  { name: 'email', displayName: 'Email Queue' },
  { name: 'analytics', displayName: 'Analytics Queue' },
];

const queueInstances = queues.map(({ name, displayName }) => {
  const queue = new Queue(name, { redis: redisConnection });
  queue.displayName = displayName;
  return queue;
});

// Bull Board 설정
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');

createBullBoard({
  queues: queueInstances.map(queue => new BullAdapter(queue, {
    readOnlyMode: false,
    allowRetries: true,
  })),
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: '🌟 Sseudam Queue Dashboard',
      boardLogo: {
        path: '',
      },
      miscLinks: [
        {
          text: 'Backend API',
          url: 'http://localhost:3000',
          target: '_blank'
        },
        {
          text: 'Health Check',
          url: 'http://localhost:3000/health',
          target: '_blank'
        },
        {
          text: 'API Docs',
          url: 'http://localhost:3000/api-docs',
          target: '_blank'
        },
      ],
    },
  },
});

// Bull Board 라우터 연결
app.use('/', serverAdapter.getRouter());

// 헬스 체크 엔드포인트
app.get('/health', async (req, res) => {
  try {
    const testQueue = queueInstances[0];
    await testQueue.getWaiting();

    res.json({
      status: 'healthy',
      service: 'Sseudam Bull Board Dashboard',
      timestamp: new Date().toISOString(),
      queues: queueInstances.length,
      redis: {
        host: redisConnection.host,
        port: redisConnection.port,
        connected: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`
🌟 Sseudam Bull Board Dashboard 시작됨!
🚀 URL: http://localhost:${port}
🔗 Redis: ${redisConnection.host}:${redisConnection.port}
📊 큐 수: ${queueInstances.length}개

큐 목록:
${queues.map(q => `  - ${q.displayName} (${q.name})`).join('\n')}
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Bull Board 서비스 종료 중...');
  await Promise.all(queueInstances.map(queue => queue.close()));
  console.log('✅ Bull Board 서비스 종료 완료');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Bull Board 서비스 종료 중...');
  await Promise.all(queueInstances.map(queue => queue.close()));
  console.log('✅ Bull Board 서비스 종료 완료');
  process.exit(0);
});