import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet, { HelmetOptions } from 'helmet';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import healthRouter from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// ✅ 원본 swagger JSON 불러오기
const rawSwaggerFile = require('../swagger-output.json');

const app = express();

const helmetOptions: HelmetOptions = {
  contentSecurityPolicy: false, // Swagger UI를 위해 CSP 완전 비활성화
};

app.use(helmet(helmetOptions));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// ✅ env 에 따라 host / schemes 덮어쓰기
const swaggerFile = {
  ...rawSwaggerFile,
  host:
    process.env.NODE_ENV === 'production'
      ? 'finalprojectsever.onrender.com' // Render 배포 도메인
      : 'localhost:8080',
  schemes:
    process.env.NODE_ENV === 'production'
      ? ['https']
      : ['http'],
};

// Setup Swagger documentation
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'list', // 기본적으로 태그들이 펼쳐진 상태로 시작
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile, swaggerOptions));
console.log('Swagger UI available at /api-docs');

app.use(healthRouter);
app.use(routes);

app.use(errorHandler);

export default app;