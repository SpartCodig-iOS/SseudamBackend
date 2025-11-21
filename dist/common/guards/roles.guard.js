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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const roles_decorator_1 = require("../decorators/roles.decorator");
const pool_1 = require("../../db/pool");
let RolesGuard = class RolesGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    async canActivate(context) {
        const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const initialRole = request.currentUser?.role ?? 'user';
        if (requiredRoles.includes(initialRole)) {
            return true;
        }
        // 토큰에 담긴 역할이 최신이 아닐 수 있어 DB에서 한 번 더 확인
        const userId = request.currentUser?.id;
        if (!userId) {
            throw new common_1.ForbiddenException('Insufficient role');
        }
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT role FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
        const dbRole = result.rows[0]?.role ?? undefined;
        if (dbRole && requiredRoles.includes(dbRole)) {
            request.currentUser = request.currentUser
                ? { ...request.currentUser, role: dbRole }
                : { id: userId, role: dbRole };
            return true;
        }
        throw new common_1.ForbiddenException('Insufficient role');
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], RolesGuard);
