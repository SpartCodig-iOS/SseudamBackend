import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithUser } from '../../types/request';
import { UserRole } from '../../types/user';
import { getPool } from '../../db/pool';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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

    const pool = await getPool();
    const result = await pool.query(
      `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const dbRole: UserRole | undefined = result.rows[0]?.role ?? undefined;

    if (dbRole && requiredRoles.includes(dbRole)) {
      request.currentUser = request.currentUser
        ? { ...request.currentUser, role: dbRole }
        : { id: userId, role: dbRole } as any;
      return true;
    }

    throw new ForbiddenException('Insufficient role');
  }
}
