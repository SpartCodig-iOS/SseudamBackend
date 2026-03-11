import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithUser } from '../types/request.types';
import { UserRole } from '../../modules/user/types/user.types';
import { UserRepository } from '../../modules/user/repositories/user.repository';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const initialRole = request.currentUser?.role ?? 'user';

    if (requiredRoles.includes(initialRole)) {
      return true;
    }

    // 토큰에 담긴 역할이 최신이 아닐 수 있어 DB에서 한 번 더 확인
    const userId = request.currentUser?.id;
    if (!userId) {
      throw new ForbiddenException('Insufficient role');
    }

    const dbRole = await this.userRepository.findRoleById(userId) as UserRole | null;

    if (dbRole && requiredRoles.includes(dbRole)) {
      request.currentUser = request.currentUser
        ? { ...request.currentUser, role: dbRole }
        : { id: userId, role: dbRole } as any;
      return true;
    }

    throw new ForbiddenException('Insufficient role');
  }
}
