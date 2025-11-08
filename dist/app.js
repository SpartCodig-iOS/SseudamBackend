"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const routes_1 = __importDefault(require("./routes"));
const health_1 = __importDefault(require("./routes/health"));
const errorHandler_1 = require("./middleware/errorHandler");
const requestLogger_1 = require("./middleware/requestLogger");
// ✅ 원본 swagger JSON 불러오기
const rawSwaggerFile = require('../swagger-output.json');
const app = (0, express_1.default)();
const helmetOptions = {
    contentSecurityPolicy: false, // Swagger UI를 위해 CSP 완전 비활성화
};
app.use((0, helmet_1.default)(helmetOptions));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(requestLogger_1.requestLogger);
app.use('/public', express_1.default.static(node_path_1.default.join(process.cwd(), 'public')));
// ✅ env 에 따라 host / schemes 덮어쓰기
const swaggerFile = {
    ...rawSwaggerFile,
    host: process.env.NODE_ENV === 'production'
        ? 'finalprojectsever.onrender.com' // Render 배포 도메인
        : 'localhost:8080',
    schemes: process.env.NODE_ENV === 'production'
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
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerFile, swaggerOptions));
console.log('Swagger UI available at /api-docs');
app.use(health_1.default);
app.use(routes_1.default);
app.use(errorHandler_1.errorHandler);
exports.default = app;
