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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_1 = require("../../types/api");
const auth_guard_1 = require("../../common/guards/auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const adminSchemas_1 = require("../../validators/adminSchemas");
const admin_service_1 = require("./admin.service");
const admin_response_dto_1 = require("./dto/admin-response.dto");
const mappers_1 = require("../../utils/mappers");
let AdminController = class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    async updateUserRole(memberId, body, req) {
        const currentUser = req.currentUser;
        if (!currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        if (currentUser.id === memberId) {
            throw new common_1.BadRequestException('자기 자신의 권한은 이 경로로 변경할 수 없습니다.');
        }
        const payload = adminSchemas_1.updateRoleSchema.parse(body);
        const updated = await this.adminService.updateUserRole(memberId, payload.role, currentUser.id);
        return (0, api_1.success)({
            ...(0, mappers_1.toUserResponse)(updated),
            role: updated.role,
            changedBy: currentUser.id,
            reason: payload.reason ?? null,
        }, 'Role updated');
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Patch)('users/:memberId/role'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('owner', 'admin', 'super_admin'),
    (0, swagger_1.ApiOperation)({ summary: '멤버 권한 변경' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['role'],
            properties: {
                role: { type: 'string', enum: ['user', 'member', 'owner', 'admin', 'super_admin'] },
                reason: { type: 'string', example: '신규 운영자 지정', nullable: true },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: admin_response_dto_1.UpdateUserRoleResponseDto }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: '인증 실패' }),
    __param(0, (0, common_1.Param)('memberId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUserRole", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('Admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('api/v1/admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
