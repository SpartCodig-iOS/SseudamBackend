const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const Queue = require('bull');

// Express 앱 생성
const app = express();
const port = process.env.PORT || 3001;
const host = process.env.HOST || 'localhost';
const protocol = process.env.PROTOCOL || 'http';

// Express 기본 설정
app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Redis 연결 설정
const redisConnection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  keyPrefix: 'sseudam:',
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
};

console.log('🔗 Redis 연결 설정:', {
  host: redisConnection.host,
  port: redisConnection.port,
  hasPassword: !!redisConnection.password,
  keyPrefix: redisConnection.keyPrefix,
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

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: queueInstances.map(queue => new BullAdapter(queue)),
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: '🌟 Sseudam Queue Dashboard',
      boardLogo: {
        path: '',
        width: '',
        height: '',
      },
      miscLinks: [
        {
          text: 'Health Check',
          url: '/health',
          target: '_self'
        },
      ],
    },
  },
});

// 헬스 체크 엔드포인트 (Bull Board 전에 등록)
app.get('/health', async (req, res) => {
  try {
    // Redis 연결 테스트
    if (queueInstances.length > 0) {
      await queueInstances[0].getWaiting();
    }

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
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Bull Board 정적 파일 서빙
app.use('/static', express.static('/app/node_modules/@bull-board/ui/dist/static'));

// Bull Board 라우터 연결
app.use('/', serverAdapter.getRouter());

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    error: {
      code: 'ROUTE_NOT_FOUND',
      details: `Cannot ${req.method} ${req.originalUrl}`,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    }
  });
});

// 에러 처리 미들웨어
app.use((err, req, res, _next) => {
  console.error('Dashboard Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      details: err.message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    }
  });
});

// 서버 시작
app.listen(port, '0.0.0.0', () => {
  console.log(`
🌟 Sseudam Bull Board Dashboard 시작됨!
🚀 URL: http://localhost:${port}
🔗 Redis: ${redisConnection.host}:${redisConnection.port}
📊 큐 수: ${queueInstances.length}개

큐 목록:
${queues.map(q => `  - ${q.displayName} (${q.name})`).join('\n')}

📋 접속 가능한 경로:
  - Dashboard: ${protocol}://${host}:${port}/
  - Health Check: ${protocol}://${host}:${port}/health
  `);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🔄 ${signal} 신호 받음. Bull Board 서비스 종료 중...`);

  try {
    // 큐 연결 종료
    await Promise.all(queueInstances.map(queue => queue.close()));
    console.log('✅ 모든 큐 연결 종료 완료');

    // 서버 종료
    process.exit(0);
  } catch (error) {
    console.error('❌ 종료 중 오류 발생:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart