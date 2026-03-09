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
exports.RequireAuth = exports.OptionalAuth = exports.GatewayRolesGuard = exports.GatewayAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const gateway_middleware_1 = require("./gateway.middleware");
/**
 * Gateway 미들웨어에서 이미 검증된 사용자 정보를 기반으로 하는 인증 가드
 * Gateway 미들웨어가 먼저 실행되어야 합니다.
 */
let GatewayAuthGuard = class GatewayAuthGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        // 메타데이터에서 인증 요구사항 확인
        const requireAuth = this.reflector.getAllAndOverride('requireAuth', [
            context.getHandler(),
            context.getClass(),
        ]);
        // 인증이 필요 없는 엔드포인트
        if (requireAuth === false) {
            return true;
        }
        // Gateway 미들웨어에서 설정한 사용자 정보 확인
        const user = (0, gateway_middleware_1.getGatewayUser)(request);
        // 인증이 필요한 엔드포인트인데 사용자 정보가 없음
        if ((requireAuth === true || requireAuth === undefined) && !user) {
            throw new common_1.UnauthorizedException('Authentication required but no valid user found from gateway');
        }
        return true;
    }
};
exports.GatewayAuthGuard = GatewayAuthGuard;
exports.GatewayAuthGuard = GatewayAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], GatewayAuthGuard);
/**
 * Gateway에서 검증된 사용자의 권한을 확인하는 가드
 */
let GatewayRolesGuard = class GatewayRolesGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        // 메타데이터에서 필요한 역할 확인
        const requiredRoles = this.reflector.getAllAndOverride('roles', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = (0, gateway_middleware_1.getGatewayUser)(request);
        if (!user) {
            throw new common_1.UnauthorizedException('No authenticated user found');
        }
        // 사용자 역할이 요구되는 역할 중 하나와 일치하는지 확인
        const hasRole = requiredRoles.includes(user.role);
        if (!hasRole) {
            throw new common_1.ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}. User role: ${user.role}`);
        }
        return true;
    }
};
exports.GatewayRolesGuard = GatewayRolesGuard;
exports.GatewayRolesGuard = GatewayRolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], GatewayRolesGuard);
/**
 * 인증이 선택적인 엔드포인트를 위한 데코레이터
 */
const OptionalAuth = () => {
    return (target, _propertyKey, descriptor) => {
        if (descriptor) {
            Reflect.defineMetadata('requireAuth', false, descriptor.value);
        }
        else {
            Reflect.defineMetadata('requireAuth', false, target);
        }
    };
};
exports.OptionalAuth = OptionalAuth;
/**
 * 인증이 필수인 엔드포인트를 위한 데코레이터
 */
const RequireAuth = () => {
    return (target, _propertyKey, descriptor) => {
        if (descriptor) {
            Reflect.defineMetadata('requireAuth', true, descriptor.value);
        }
        else {
            Reflect.defineMetadata('requireAuth', true, target);
        }
    };
};
exports.RequireAuth = RequireAuth;
