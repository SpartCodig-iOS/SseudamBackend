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
exports.AuthTestController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
/**
 * 개발/스테이징 환경 전용 인증 테스트 컨트롤러.
 * 프로덕션에서는 인스턴스화 시 즉시 ForbiddenException을 던집니다.
 * AuthModule에서 주석 처리되어 있으며 필요 시에만 활성화합니다.
 */
let AuthTestController = class AuthTestController {
    constructor(authService) {
        this.authService = authService;
        if (process.env.NODE_ENV === 'production') {
            throw new common_1.ForbiddenException('AuthTestController is not available in production');
        }
    }
    async login(loginInput) {
        return this.authService.login(loginInput);
    }
    getBackendStatus() {
        return {
            backend: 'TypeORM',
            timestamp: new Date().toISOString(),
        };
    }
    async checkUserExists(identifier) {
        if (!identifier) {
            return { error: 'identifier query parameter is required' };
        }
        const exists = await this.authService['userRepository'].findByEmail(identifier.toLowerCase()) !== null
            || await this.authService['userRepository'].findByUsername(identifier) !== null;
        return {
            identifier,
            exists,
            backend: 'TypeORM',
        };
    }
};
exports.AuthTestController = AuthTestController;
__decorate([
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({ summary: 'TypeORM 기반 로그인 테스트' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Login successful' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthTestController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('backend-status'),
    (0, swagger_1.ApiOperation)({ summary: '현재 백엔드 상태 확인' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Backend status' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthTestController.prototype, "getBackendStatus", null);
__decorate([
    (0, common_1.Get)('user-exists'),
    (0, swagger_1.ApiOperation)({ summary: '사용자 존재 여부 확인 (이메일 기준)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User existence check' }),
    __param(0, (0, common_1.Query)('identifier')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthTestController.prototype, "checkUserExists", null);
exports.AuthTestController = AuthTestController = __decorate([
    (0, swagger_1.ApiTags)('Auth Testing'),
    (0, swagger_1.ApiExcludeController)(),
    (0, common_1.Controller)('auth-test'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthTestController);
