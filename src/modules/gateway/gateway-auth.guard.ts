import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { getGatewayUser } from './gateway.middleware';
import { UserRole } from '../user/types/user.types';

/**
 * Gateway 미들웨어에서 이미 검증된 사용자 정보를 기반으로 하는 인증 가드
 * Gateway 미들웨어가 먼저 실행되어야 합니다.
 */
@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // 메타데이터에서 인증 요구사항 확인
    const requireAuth = this.reflector.getAllAndOverride<boolean>('requireAuth', [
      context.getHandler(),
      context.getClass(),
    ]);

    // 인증이 필요 없는 엔드포인트
    if (requireAuth === false) {
      return true;
    }

    // Gateway 미들웨어에서 설정한 사용자 정보 확인
    const user = getGatewayUser(request);

    // 인증이 필요한 엔드포인트인데 사용자 정보가 없음
    if ((requireAuth === true || requireAuth === undefined) && !user) {
      throw new UnauthorizedException('Authentication required but no valid user found from gateway');
    }

    return true;
  }
}

/**
 * Gateway에서 검증된 사용자의 권한을 확인하는 가드
 */
@Injectable()
export class GatewayRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 메타데이터에서 필요한 역할 확인
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = getGatewayUser(request);

    if (!user) {
      throw new UnauthorizedException('No authenticated user found');
    }

    // 사용자 역할이 요구되는 역할 중 하나와 일치하는지 확인
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}. User role: ${user.role}`);
    }

    return true;
  }
}

/**
 * 인증이 선택적인 엔드포인트를 위한 데코레이터
 */
export const OptionalAuth = () => {
  return (target: any, _propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata('requireAuth', false, descriptor.value);
    } else {
      Reflect.defineMetadata('requireAuth', false, target);
    }
  };
};

/**
 * 인증이 필수인 엔드포인트를 위한 데코레이터
 */
export const RequireAuth = () => {
  return (target: any, _propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata('requireAuth', true, descriptor.value);
    } else {
      Reflect.defineMetadata('requireAuth', true, target);
    }
  };
};