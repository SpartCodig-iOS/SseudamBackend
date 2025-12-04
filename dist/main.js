"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const node_dns_1 = __importDefault(require("node:dns"));
node_dns_1.default.setDefaultResultOrder('ipv4first');
const node_path_1 = __importDefault(require("node:path"));
const express_1 = require("express");
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const Sentry = __importStar(require("@sentry/node"));
const app_module_1 = require("./app.module");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const memory_optimizer_1 = require("./utils/memory-optimizer");
async function bootstrap() {
    // 메모리 최적화 초기화
    memory_optimizer_1.MemoryOptimizer.initialize();
    if (env_1.env.sentryDsn) {
        const client = Sentry.init({
            dsn: env_1.env.sentryDsn,
            environment: env_1.env.nodeEnv,
            tracesSampleRate: env_1.env.sentryTracesSampleRate,
            profilesSampleRate: 0.1, // 10% 프로파일링 샘플링
            integrations: [Sentry.expressIntegration()],
        });
        if (client) {
            Sentry.initOpenTelemetry(client);
        }
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const resolvedLogLevel = env_1.env.logLevel?.toLowerCase() ?? 'info';
    const loggerLevels = {
        silent: [],
        error: ['error'],
        warn: ['error', 'warn'],
        info: ['error', 'warn', 'log'],
        debug: ['error', 'warn', 'log', 'debug'],
        verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
    };
    const selectedLevels = loggerLevels[resolvedLogLevel] ?? loggerLevels.info;
    if (selectedLevels.length === 0) {
        app.useLogger(false);
    }
    else {
        app.useLogger(selectedLevels);
    }
    const helmetOptions = {
        contentSecurityPolicy: false,
    };
    app.use((0, helmet_1.default)(helmetOptions));
    app.use((0, compression_1.default)({
        threshold: 512, // 512B 이상일 때만 압축 (더 작은 임계값)
        level: 6, // 압축 레벨 (1: 빠름, 9: 최고 압축률, 6: 균형)
        memLevel: 9, // 메모리 사용량 레벨 (1-9, 높을수록 빠름) - 증가
        chunkSize: 32768, // 청크 크기 (32KB) - 증가
        windowBits: 15, // 압축 윈도우 크기
        // strategy: compression.constants.Z_DEFAULT_STRATEGY, // 기본 압축 전략
        filter: (req, res) => {
            // 압축 제외 조건
            if (req.headers['x-no-compression']) {
                return false;
            }
            // 이미 압축된 파일 타입 제외
            const contentType = res.getHeader('content-type');
            if (contentType) {
                const skipCompressionTypes = [
                    'image/', 'video/', 'audio/',
                    'application/zip', 'application/gzip',
                    'application/x-rar', 'application/pdf',
                    'application/octet-stream',
                ];
                if (skipCompressionTypes.some(type => contentType.includes(type))) {
                    return false;
                }
            }
            // 매우 작은 응답은 압축하지 않음
            const contentLength = res.getHeader('content-length');
            if (contentLength && parseInt(contentLength) < 512) {
                return false;
            }
            return compression_1.default.filter(req, res);
        },
    }));
    const allowedOrigins = new Set(env_1.env.corsOrigins);
    const allowAll = allowedOrigins.has('*');
    const localOrigins = [
        `http://localhost:${env_1.env.port}`,
        `http://127.0.0.1:${env_1.env.port}`,
        `http://0.0.0.0:${env_1.env.port}`,
    ];
    localOrigins.forEach((origin) => allowedOrigins.add(origin));
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowAll) {
                return callback(null, true);
            }
            if (allowedOrigins.has(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
        },
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        credentials: true,
    });
    // HTTP 요청 크기 및 타임아웃 제한 (8GB 메모리 활용)
    app.use((0, express_1.json)({ limit: '50mb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '50mb' }));
    // 글로벌 타임아웃 설정 (30초)
    app.use((req, res, next) => {
        req.setTimeout(30000, () => {
            res.status(408).json({ message: 'Request timeout' });
        });
        next();
    });
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    // Apple Universal Links는 이제 컨트롤러로 처리됨
    app.useStaticAssets(node_path_1.default.join(process.cwd(), 'public'));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Sseduam App Server API')
        .setDescription('Sseduam 연동 인증/프로필 API')
        .setVersion('1.0.0')
        .addTag('Health', '서버 상태 및 헬스체크')
        .addTag('Auth', '이메일/소셜 로그인/로그아웃')
        .addTag('OAuth', '소셜 OAuth 연동')
        .addTag('Profile', '프로필 조회/수정')
        .addTag('Session', '세션 조회')
        .addTag('Travels', '여행 CRUD')
        .addTag('Travel Expenses', '여행 지출 기록')
        .addTag('Travel Settlements', '정산/통계')
        .addTag('Meta', '메타/환율 정보')
        .addBearerAuth()
        .addServer(env_1.env.nodeEnv === 'production'
        ? 'https://sseudam.up.railway.app'
        : `http://localhost:${env_1.env.port}`)
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig, {
        deepScanRoutes: true,
        ignoreGlobalPrefix: false,
        // 기본값 자동 생성을 비활성화
        extraModels: [],
    });
    swagger_1.SwaggerModule.setup('api-docs', app, document, {
        explorer: true,
        swaggerOptions: {
            docExpansion: 'list',
            displayRequestDuration: true,
            filter: true,
            showExtensions: false,
            showCommonExtensions: false,
            tryItOutEnabled: true,
            // default 값들을 UI에 표시하지 않음
            showValues: false,
            // showSchema: false, // DTO가 보이도록 스키마는 표시
            // 기본값 관련 옵션들 비활성화
            prefilledExamples: false,
            defaultModelRendering: 'model',
            // DTO 모델은 보이도록 설정, default 값만 숨김
            defaultModelExpandDepth: 1,
            defaultModelsExpandDepth: 1,
            // 추가 옵션들로 default 값 완전 제거
            syntaxHighlight: {
                activated: true,
                theme: 'agate'
            },
        },
    });
    await app.listen(env_1.env.port);
    logger_1.logger.info('Server listening', { port: env_1.env.port, env: env_1.env.nodeEnv });
    setTimeout(async () => {
        try {
            const { MetaService } = await Promise.resolve().then(() => __importStar(require('./modules/meta/meta.service')));
            const metaService = app.get(MetaService);
            await metaService.warmupCache();
        }
        catch (error) {
            logger_1.logger.error('Cache warmup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }, 1000);
}
bootstrap();
