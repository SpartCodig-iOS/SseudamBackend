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
exports.SessionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_1 = require("../../types/api");
const sessionService_1 = require("../../services/sessionService");
const session_response_dto_1 = require("./dto/session-response.dto");
let SessionController = class SessionController {
    constructor(sessionService) {
        this.sessionService = sessionService;
    }
    getSession(sessionId) {
        if (!sessionId) {
            throw new common_1.BadRequestException('Session ID parameter is required');
        }
        const session = this.sessionService.updateSessionLastLogin(sessionId);
        if (!session) {
            throw new common_1.UnauthorizedException('Invalid or expired session');
        }
        return (0, api_1.success)({
            loginType: session.loginType || 'unknown',
            lastLoginAt: session.lastLoginAt || null,
            userId: session.userId,
            email: session.email,
            sessionId: session.sessionId,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
        }, 'Session info retrieved successfully');
    }
};
exports.SessionController = SessionController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiQuery)({
        name: 'sessionId',
        required: true,
        description: '초대/로그인 응답으로 받은 세션 ID',
    }),
    (0, swagger_1.ApiOperation)({ summary: '세션 ID 로 현재 로그인 세션 정보 조회' }),
    (0, swagger_1.ApiOkResponse)({ type: session_response_dto_1.SessionResponseDto }),
    __param(0, (0, common_1.Query)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SessionController.prototype, "getSession", null);
exports.SessionController = SessionController = __decorate([
    (0, swagger_1.ApiTags)('Session'),
    (0, common_1.Controller)('api/v1/session'),
    __metadata("design:paramtypes", [sessionService_1.SessionService])
], SessionController);
