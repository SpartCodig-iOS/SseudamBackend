"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwtService_1 = require("../../services/jwtService");
const api_1 = require("../../types/api");
const crypto_1 = require("crypto");
// 개발 환경이 아니면 이 컨트롤러를 완전히 숨김
let DevController = class DevController {
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    async generateInfiniteToken(body) {
        // 임시로 모든 환경에서 허용 (TODO: 나중에 제거 예정)
        // if (env.nodeEnv !== 'development') {
        //   throw new ForbiddenException('This endpoint is only available in development environment');
        // }
        // 하드코딩된 테스트 계정 확인
        if (body.id !== 'test' || body.password !== 'test123!') {
            throw new common_1.BadRequestException('Invalid test credentials');
        }
        // 테스트용 가짜 유저 데이터
        const testUser = {
            id: 'fe6e64fb-f82c-4967-aafc-76e648d504d1', // UUID 형식으로 변경
            email: 'test@example.com',
            password_hash: 'fake-hash',
            name: '테스트 사용자',
            avatar_url: null,
            username: 'testuser',
            role: 'user',
            created_at: new Date(),
            updated_at: new Date(),
        };
        const sessionId = (0, crypto_1.randomUUID)();
        const infiniteToken = this.jwtService.generateInfiniteToken(testUser, sessionId);
        return (0, api_1.success)({
            accessToken: infiniteToken,
            user: {
                id: testUser.id,
                email: testUser.email,
                name: testUser.name,
                role: testUser.role,
            },
        }, 'Infinite token generated for testing');
    }
};
exports.DevController = DevController;
__decorate([
    (0, common_1.Post)('infinite-token'),
    (0, swagger_1.ApiOperation)({
        summary: '개발용 무한토큰 생성',
        description: '개발 환경에서만 사용 가능한 테스트용 무한토큰 생성'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['id', 'password'],
            properties: {
                id: { type: 'string', example: 'test' },
                password: { type: 'string', example: 'test123!' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '무한토큰 생성 성공',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'Infinite token generated' },
                data: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' },
                                name: { type: 'string' },
                                role: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DevController.prototype, "generateInfiniteToken", null);
exports.DevController = DevController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, swagger_1.ApiTags)('Development'),
    (0, common_1.Controller)('api/v1/dev'),
    __metadata("design:paramtypes", [jwtService_1.JwtTokenService])
], DevController);
