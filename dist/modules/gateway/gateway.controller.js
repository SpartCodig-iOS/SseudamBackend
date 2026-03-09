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
var GatewayController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayController = exports.GatewayValidateDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const gateway_service_1 = require("./gateway.service");
class GatewayValidateDto {
}
exports.GatewayValidateDto = GatewayValidateDto;
let GatewayController = GatewayController_1 = class GatewayController {
    constructor(gatewayService) {
        this.gatewayService = gatewayService;
        this.logger = new common_1.Logger(GatewayController_1.name);
    }
    /**
     * 요청 검증 엔드포인트 - 다른 서비스에서 호출
     */
    async validateRequest(requestData) {
        try {
            const gatewayRequest = {
                method: requestData.method,
                path: requestData.path,
                headers: requestData.headers,
                body: requestData.body,
                query: requestData.query,
                ip: requestData.ip,
                userAgent: requestData.userAgent,
            };
            const result = await this.gatewayService.validateRequest(gatewayRequest);
            // 로깅 (성공/실패 모두)
            if (result.allowed) {
                this.logger.log(`Request allowed: ${requestData.method} ${requestData.path} - User: ${result.user?.id || 'anonymous'}`);
            }
            else {
                this.logger.warn(`Request blocked: ${requestData.method} ${requestData.path} - Reason: ${result.reason}`);
            }
            return result;
        }
        catch (error) {
            this.logger.error(`Gateway validation error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw new common_1.HttpException({
                allowed: false,
                reason: 'Gateway service error',
                message: 'Internal gateway validation error',
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    /**
     * 현재 요청의 인증 상태 확인 (미들웨어용)
     */
    async checkCurrentAuth(req, headers) {
        const gatewayRequest = {
            method: req.method,
            path: req.path,
            headers,
            body: req.body,
            query: req.query,
            ip: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent'),
        };
        return this.gatewayService.validateRequest(gatewayRequest);
    }
    /**
     * Gateway 상태 및 통계 조회
     */
    async getGatewayStats() {
        try {
            return await this.gatewayService.getGatewayStats();
        }
        catch (error) {
            this.logger.error(`Failed to get gateway stats: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.HttpException({
                message: 'Failed to retrieve gateway statistics',
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    /**
     * IP를 의심스러운 목록에 추가
     */
    async blockSuspiciousIP(body) {
        try {
            await this.gatewayService.addSuspiciousIP(body.ip, body.reason, body.ttlSeconds);
            return { success: true, message: `IP ${body.ip} has been added to suspicious list` };
        }
        catch (error) {
            this.logger.error(`Failed to block IP ${body.ip}: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.HttpException({
                message: 'Failed to block IP address',
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    /**
     * 계정 잠금
     */
    async lockUserAccount(body) {
        try {
            await this.gatewayService.lockAccount(body.userId, body.reason, body.ttlSeconds);
            return { success: true, message: `Account ${body.userId} has been locked` };
        }
        catch (error) {
            this.logger.error(`Failed to lock account ${body.userId}: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.HttpException({
                message: 'Failed to lock user account',
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.GatewayController = GatewayController;
__decorate([
    (0, common_1.Post)('validate'),
    (0, swagger_1.ApiOperation)({
        summary: '요청 인증 및 권한 검증',
        description: '마이크로서비스 아키텍처에서 다른 서비스가 요청 검증을 위해 호출하는 엔드포인트',
    }),
    (0, swagger_1.ApiBody)({ type: GatewayValidateDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '검증 결과',
        schema: {
            type: 'object',
            properties: {
                allowed: { type: 'boolean' },
                user: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string' },
                        role: { type: 'string' },
                    },
                },
                reason: { type: 'string' },
                rateLimitInfo: {
                    type: 'object',
                    properties: {
                        remaining: { type: 'number' },
                        resetTime: { type: 'number' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [GatewayValidateDto]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "validateRequest", null);
__decorate([
    (0, common_1.Post)('check-auth'),
    (0, swagger_1.ApiOperation)({
        summary: '현재 요청의 인증 상태 확인',
        description: 'Gateway 미들웨어에서 사용하는 내부 엔드포인트',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "checkCurrentAuth", null);
__decorate([
    (0, common_1.Post)('stats'),
    (0, swagger_1.ApiOperation)({
        summary: 'Gateway 통계 조회',
        description: 'Gateway의 현재 상태와 통계 정보를 조회합니다.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Gateway 통계 정보',
        schema: {
            type: 'object',
            properties: {
                totalRequests: { type: 'number' },
                blockedRequests: { type: 'number' },
                topBlockReasons: {
                    type: 'object',
                    additionalProperties: { type: 'number' },
                },
                rateLimitHits: { type: 'number' },
                authFailures: { type: 'number' },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getGatewayStats", null);
__decorate([
    (0, common_1.Post)('block-ip'),
    (0, swagger_1.ApiOperation)({
        summary: '의심스러운 IP 차단',
        description: '특정 IP를 의심스러운 목록에 추가하여 일시적으로 차단합니다.',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                ip: { type: 'string', description: '차단할 IP 주소' },
                reason: { type: 'string', description: '차단 사유' },
                ttlSeconds: { type: 'number', description: '차단 지속 시간 (초)', default: 3600 },
            },
            required: ['ip', 'reason'],
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "blockSuspiciousIP", null);
__decorate([
    (0, common_1.Post)('lock-account'),
    (0, swagger_1.ApiOperation)({
        summary: '계정 잠금',
        description: '특정 사용자 계정을 일시적으로 잠급니다.',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '잠금할 사용자 ID' },
                reason: { type: 'string', description: '잠금 사유' },
                ttlSeconds: { type: 'number', description: '잠금 지속 시간 (초)', default: 1800 },
            },
            required: ['userId', 'reason'],
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "lockUserAccount", null);
exports.GatewayController = GatewayController = GatewayController_1 = __decorate([
    (0, swagger_1.ApiTags)('Gateway'),
    (0, common_1.Controller)('api/v1/gateway'),
    __metadata("design:paramtypes", [gateway_service_1.GatewayService])
], GatewayController);
