import { Request } from 'express';
import { LoginType } from '../../../modules/auth/domain/types';
import { UserRecord } from '../../../modules/user/domain/types';

export interface RequestWithUser extends Request {
  currentUser?: UserRecord;
  loginType?: LoginType;
}
