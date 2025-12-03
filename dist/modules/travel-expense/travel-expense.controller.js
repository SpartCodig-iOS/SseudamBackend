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
exports.TravelExpenseController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../common/guards/auth.guard");
const api_1 = require("../../types/api");
const travel_expense_service_1 = require("./travel-expense.service");
const travel_response_dto_1 = require("../travel/dto/travel-response.dto");
const travelExpenseSchemas_1 = require("../../validators/travelExpenseSchemas");
let TravelExpenseController = class TravelExpenseController {
    constructor(travelExpenseService) {
        this.travelExpenseService = travelExpenseService;
    }
    async list(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const page = Number(req.query?.page ?? '1') || 1;
        const limit = Number(req.query?.limit ?? '20') || 20;
        const result = await this.travelExpenseService.listExpenses(travelId, req.currentUser.id, { page, limit });
        return (0, api_1.success)(result);
    }
    async create(travelId, body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = travelExpenseSchemas_1.createExpenseSchema.parse(body);
        const expense = await this.travelExpenseService.createExpense(travelId, req.currentUser.id, payload);
        return (0, api_1.success)(expense, 'Expense created');
    }
    async updateExpense(travelId, expenseId, body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = travelExpenseSchemas_1.createExpenseSchema.parse(body);
        const expense = await this.travelExpenseService.updateExpense(travelId, expenseId, req.currentUser.id, payload);
        return (0, api_1.success)(expense, 'Expense updated');
    }
    async deleteExpense(travelId, expenseId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        await this.travelExpenseService.deleteExpense(travelId, expenseId, req.currentUser.id);
        return (0, api_1.success)(null, 'Expense deleted');
    }
};
exports.TravelExpenseController = TravelExpenseController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 지출 목록 조회' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelExpenseDto, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 20 }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelExpenseController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '여행 지출 추가' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['title', 'amount', 'currency', 'expenseDate'],
            properties: {
                title: { type: 'string', example: '라멘 식비', maxLength: 50, description: '지출 제목 (최대 50자)' },
                note: { type: 'string', example: '신주쿠역 인근', nullable: true },
                amount: { type: 'number', example: 3500, minimum: 0.01, description: '지출 금액 (필수, 양수)' },
                currency: { type: 'string', example: 'JPY', description: '지출 통화 (3자리 코드)' },
                expenseDate: { type: 'string', example: '2025-11-26', description: 'YYYY-MM-DD' },
                category: { type: 'string', example: 'food', maxLength: 20, pattern: '^[a-zA-Z0-9가-힣_-]+$', nullable: true, description: '카테고리 (영문/숫자/한글/_/- 만 가능, 최대 20자)' },
                participantIds: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    minItems: 1,
                    maxItems: 20,
                    nullable: true,
                    description: '지출 분배 대상 (1-20명, 중복 불가, 생략 시 모든 팀원)',
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelExpenseDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TravelExpenseController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':expenseId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 지출 수정' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['title', 'amount', 'currency', 'expenseDate'],
            properties: {
                title: { type: 'string', example: '라멘 식비', maxLength: 50, description: '지출 제목 (최대 50자)' },
                note: { type: 'string', example: '신주쿠역 인근', nullable: true },
                amount: { type: 'number', example: 3500, minimum: 0.01, description: '지출 금액 (필수, 양수)' },
                currency: { type: 'string', example: 'JPY', description: '지출 통화 (3자리 코드)' },
                expenseDate: { type: 'string', example: '2025-11-26', description: 'YYYY-MM-DD' },
                category: { type: 'string', example: 'food', maxLength: 20, pattern: '^[a-zA-Z0-9가-힣_-]+$', nullable: true, description: '카테고리 (영문/숫자/한글/_/- 만 가능, 최대 20자)' },
                participantIds: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    minItems: 1,
                    maxItems: 20,
                    nullable: true,
                    description: '지출 분배 대상 (1-20명, 중복 불가, 생략 시 모든 팀원)',
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_response_dto_1.TravelExpenseDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Param)('expenseId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], TravelExpenseController.prototype, "updateExpense", null);
__decorate([
    (0, common_1.Delete)(':expenseId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '여행 지출 삭제' }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'Expense deleted' },
                data: { type: 'null' }
            }
        }
    }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Param)('expenseId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TravelExpenseController.prototype, "deleteExpense", null);
exports.TravelExpenseController = TravelExpenseController = __decorate([
    (0, swagger_1.ApiTags)('Travel Expenses'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)('api/v1/travels/:travelId/expenses'),
    __metadata("design:paramtypes", [travel_expense_service_1.TravelExpenseService])
], TravelExpenseController);
