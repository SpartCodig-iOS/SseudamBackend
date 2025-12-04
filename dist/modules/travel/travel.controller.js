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
exports.TravelController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_1 = require("../../types/api");
const auth_guard_1 = require("../../common/guards/auth.guard");
const travel_service_1 = require("./travel.service");
const optimized_travel_service_1 = require("./optimized-travel.service");
const travelSchemas_1 = require("../../validators/travelSchemas");
const travel_response_dto_1 = require("./dto/travel-response.dto");
let TravelController = class TravelController {
    constructor(travelService, optimizedTravelService) {
        this.travelService = travelService;
        this.optimizedTravelService = optimizedTravelService;
    }
    async list(req, request) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const page = Number(request.query?.page ?? '1') || 1;
        const limit = Number(request.query?.limit ?? '20') || 20;
        // 최적화된 여행 서비스 사용 (200-400ms 목표) - 항상 멤버 정보 포함
        const result = await this.optimizedTravelService.listTravelsOptimized(req.currentUser.id, { page, limit }, true // 항상 멤버 정보 포함
        );
        return (0, api_1.success)(result);
    }
    async create(body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = travelSchemas_1.createTravelSchema.parse(body);
        const currentUser = req.currentUser;
        if (!currentUser) {
            throw new Error('Authenticated user not found in request');
        }
        const travel = await this.travelService.createTravel(currentUser, payload);
        return (0, api_1.success)(travel, 'Travel created');
    }
    async updateTravel(travelId, body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = travelSchemas_1.createTravelSchema.parse(body);
        const travel = await this.travelService.updateTravel(travelId, req.currentUser.id, payload);
        return (0, api_1.success)(travel, 'Travel updated');
    }
    async getTravel(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const travel = await this.travelService.getTravelDetail(travelId, req.currentUser.id);
        return (0, api_1.success)(travel);
    }
    async removeMember(travelId, memberId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        await this.travelService.removeMember(travelId, req.currentUser.id, memberId);
        return (0, api_1.success)({}, 'Member removed');
    }
    async createInvite(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const invite = await this.travelService.createInvite(travelId, req.currentUser.id);
        return (0, api_1.success)(invite, 'Invite code issued');
    }
    async join(body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = travelSchemas_1.travelInviteCodeSchema.parse(body);
        const travel = await this.travelService.joinByInviteCode(req.currentUser.id, payload.inviteCode);
        return (0, api_1.success)(travel, 'Joined travel');
    }
    async joinByDeepLink(inviteCode, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        try {
            const travel = await this.travelService.joinByInviteCode(req.currentUser.id, inviteCode);
            return (0, api_1.success)({
                ...travel,
                joinMethod: 'deeplink'
            }, 'Successfully joined travel via deep link');
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw new common_1.BadRequestException('이미 참여중인 여행이거나 유효하지 않은 초대 코드입니다.');
            }
            throw error;
        }
    }
    async transferOwnership(travelId, body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = travelSchemas_1.transferOwnershipSchema.parse(body);
        const travel = await this.travelService.transferOwnership(travelId, req.currentUser.id, payload.newOwnerId);
        return (0, api_1.success)(travel, 'Travel ownership transferred');
    }
    async leaveTravel(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const result = await this.travelService.leaveTravel(travelId, req.currentUser.id);
        return (0, api_1.success)(result, result.deletedTravel ? 'Travel deleted' : 'Left travel');
    }
    async deleteTravel(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        await this.travelService.deleteTravel(travelId, req.currentUser.id);
        return (0, api_1.success)({}, 'Travel deleted');
    }
};
exports.TravelController = TravelController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '참여 중인 여행 목록 조회 (최적화됨)' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelSummaryDto, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 20 }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelListResponseDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '새 여행 생성' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['title', 'startDate', 'endDate', 'countryCode', 'baseCurrency', 'baseExchangeRate'],
            properties: {
                title: { type: 'string', example: '도쿄 가을 여행', description: '여행 이름' },
                startDate: {
                    type: 'string',
                    example: '2025-10-01',
                    description: '여행 시작일 (YYYY-MM-DD)',
                },
                endDate: {
                    type: 'string',
                    example: '2025-10-05',
                    description: '여행 종료일 (YYYY-MM-DD) - 시작일 이후여야 함',
                },
                countryCode: {
                    type: 'string',
                    example: 'JP',
                    description: '여행 국가 ISO 3166-1 alpha-2 코드',
                },
                countryNameKr: {
                    type: 'string',
                    example: '일본',
                    description: '여행 국가 한국어 이름 (선택사항)',
                },
                baseCurrency: {
                    type: 'string',
                    example: 'KRW',
                    description: '기준 통화 (ISO 4217 코드, 예: KRW, USD, JPY)',
                },
                baseExchangeRate: {
                    type: 'number',
                    example: 105.6,
                    description: '기준 통화 1,000단위 대비 상대 통화 금액 (예: 1000 KRW → 105.6 JPY)',
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelSummaryDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':travelId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 정보 수정 (호스트 전용)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['title', 'startDate', 'endDate', 'countryCode', 'baseCurrency', 'baseExchangeRate'],
            properties: {
                title: { type: 'string', example: '일본 겨울 여행' },
                startDate: { type: 'string', example: '2025-12-01' },
                endDate: { type: 'string', example: '2025-12-05' },
                countryCode: { type: 'string', example: 'JP' },
                countryNameKr: {
                    type: 'string',
                    example: '일본',
                    description: '여행 국가 한국어 이름 (선택사항)',
                },
                baseCurrency: { type: 'string', example: 'KRW' },
                baseExchangeRate: { type: 'number', example: 105.6 },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelSummaryDto }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "updateTravel", null);
__decorate([
    (0, common_1.Get)(':travelId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 상세 조회 (travelId 기반)' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelSummaryDto }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "getTravel", null);
__decorate([
    (0, common_1.Delete)(':travelId/members/:memberId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 멤버 삭제 (호스트 전용)' }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Param)('memberId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Post)(':travelId/invite'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '여행 초대 코드 생성' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelInviteResponseDto }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "createInvite", null);
__decorate([
    (0, common_1.Post)('join'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '초대 코드로 여행 참여' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['inviteCode'],
            properties: {
                inviteCode: { type: 'string', example: 'a1b2c3d4' },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelSummaryDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "join", null);
__decorate([
    (0, common_1.Get)('join/:inviteCode'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '딥링크로 여행 참여 (GET 방식)' }),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Param)('inviteCode')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "joinByDeepLink", null);
__decorate([
    (0, common_1.Patch)(':travelId/owner'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 호스트 권한 위임 (기존 호스트 → 멤버)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['newOwnerId'],
            properties: {
                newOwnerId: { type: 'string', format: 'uuid', example: 'e11cc73b-052d-4740-8213-999c05bfc332' },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelSummaryDto }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "transferOwnership", null);
__decorate([
    (0, common_1.Delete)(':travelId/leave'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 나가기 (멤버만 가능, 호스트 불가)' }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "leaveTravel", null);
__decorate([
    (0, common_1.Delete)(':travelId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 삭제 (호스트 전용)' }),
    __param(0, (0, common_1.Param)('travelId', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelController.prototype, "deleteTravel", null);
exports.TravelController = TravelController = __decorate([
    (0, swagger_1.ApiTags)('Travels'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)('api/v1/travels'),
    __metadata("design:paramtypes", [travel_service_1.TravelService,
        optimized_travel_service_1.OptimizedTravelService])
], TravelController);
