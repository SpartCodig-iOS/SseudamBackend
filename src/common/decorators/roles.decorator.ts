import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/user/types/user.types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
