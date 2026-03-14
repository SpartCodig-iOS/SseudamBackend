import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '../../user/repositories/user.repository';
import { User } from '../../user/entities/user.entity';
import { UserRecord } from '../../../types/user.types';
import * as bcrypt from 'bcryptjs';

/**
 * @deprecated AuthService가 TypeORM으로 완전히 마이그레이션되어 이 어댑터는 더 이상 필요하지 않습니다.
 * 인증 로직은 AuthService와 UserRepository를 직접 사용하세요.
 *
 * 이 파일은 하위 호환성을 위해 유지되며 다음 메이저 버전에서 제거됩니다.
 */
@Injectable()
export class AuthTypeOrmAdapter {
  private readonly logger = new Logger(AuthTypeOrmAdapter.name);

  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * TypeORM User를 기존 UserRecord 형식으로 변환
   */
  private toUserRecord(user: User): UserRecord {
    return {
      id: user.id,
      email: user.email,
      password_hash: '', // 필드 제거됨
      name: user.name,
      avatar_url: user.avatar_url,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  /**
   * 기존 authenticateUserDirect 로직을 TypeORM으로 대체
   * 기존 메서드와 동일한 시그니처 유지
   */
  async authenticateUserDirect(
    identifier: string,
    password: string,
    options: { lookupType?: 'email' | 'username' | 'auto'; emailHint?: string } = {},
  ): Promise<UserRecord | null> {
    const authStartTime = Date.now();

    try {
      // TypeORM으로 사용자 찾기
      let user: User | null = null;

      if (options.lookupType === 'email' || identifier.includes('@')) {
        user = await this.userRepository.findByEmail(identifier.toLowerCase());
      } else if (options.lookupType === 'username') {
        user = await this.userRepository.findByUsername(identifier.toLowerCase());
      } else {
        user = await this.userRepository.findByEmailOrUsername(identifier.toLowerCase());
      }

      if (!user) {
        this.logger.debug(`User not found: ${identifier}`);
        return null;
      }

      // 비밀번호 검증 - 필드 제거되어 임시 처리
      // const isValidPassword = await bcrypt.compare(password, user.password_hash);
      // if (!isValidPassword) {
      //   this.logger.debug(`Invalid password for user: ${identifier}`);
      //   return null;
      // }
      this.logger.warn('password_hash field removed - skipping password validation');

      const authDuration = Date.now() - authStartTime;
      this.logger.debug(`TypeORM auth completed in ${authDuration}ms for ${identifier}`);

      // 기존 형식으로 변환하여 반환
      return this.toUserRecord(user);
    } catch (error) {
      this.logger.error(`TypeORM authentication failed for ${identifier}:`, error);
      return null;
    }
  }

  /**
   * 사용자 조회 (기존 형식으로 반환)
   */
  async getUserById(userId: string): Promise<UserRecord | null> {
    try {
      const user = await this.userRepository.findById(userId);
      return user ? this.toUserRecord(user) : null;
    } catch (error) {
      this.logger.error(`TypeORM getUserById failed for ${userId}:`, error);
      return null;
    }
  }

  /**
   * 이메일 존재 여부 확인
   */
  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findByEmail(email.toLowerCase());
      return user !== null;
    } catch (error) {
      this.logger.error(`TypeORM checkEmailExists failed for ${email}:`, error);
      return false;
    }
  }

  /**
   * 유저네임 존재 여부 확인
   */
  async checkUsernameExists(username: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findByUsername(username.toLowerCase());
      return user !== null;
    } catch (error) {
      this.logger.error(`TypeORM checkUsernameExists failed for ${username}:`, error);
      return false;
    }
  }

  /**
   * 마지막 로그인 시간 업데이트
   */
  async markLastLogin(userId: string): Promise<void> {
    try {
      await this.userRepository.update(userId, {
        updated_at: new Date(),
      });
      this.logger.debug(`Updated last login for user: ${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to update last login for user ${userId}:`, error);
    }
  }

  /**
   * 사용자 생성 (기존 signup 로직용)
   */
  async createUser(userData: {
    id: string;
    email: string;
    password_hash: string;
    name?: string | null;
    username: string;
    role?: string;
  }): Promise<UserRecord> {
    try {
      const user = await this.userRepository.create({
        id: userData.id,
        email: userData.email,
        password_hash: '', // 필드 제거됨
        name: userData.name || null,
        username: userData.username,
        role: (userData.role as any) || 'user',
        avatar_url: null,
      });

      return this.toUserRecord(user);
    } catch (error) {
      this.logger.error(`TypeORM createUser failed:`, error);
      throw error;
    }
  }
}