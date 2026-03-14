import { Injectable, Logger } from '@nestjs/common';

interface UserRecord {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  username?: string;
  password_hash?: string;
  role?: string;
  created_at?: Date;
  updated_at?: Date;
}

import { LoginType } from '../types/auth.types';

@Injectable()
export class OptimizedDeleteService {
  private readonly logger = new Logger(OptimizedDeleteService.name);

  constructor() {}

  /**
   * 임시 비활성화된 계정 삭제 서비스
   */
  async fastDeleteAccount(
    user: UserRecord,
    loginTypeHint?: LoginType
  ): Promise<{ supabaseDeleted: boolean }> {
    this.logger.log('Account deletion service is currently disabled');

    // 임시로 항상 성공으로 응답
    return { supabaseDeleted: false };
  }
}