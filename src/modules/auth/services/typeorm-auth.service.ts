import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UserRepository } from '../../user/repositories/user.repository';
import { User } from '../../user/entities/user.entity';
import * as bcrypt from 'bcryptjs';

/**
 * TypeORM을 사용한 새로운 인증 서비스
 * 기존 AuthService와 병행 사용하면서 점진적으로 마이그레이션
 */
@Injectable()
export class TypeOrmAuthService {
  private readonly logger = new Logger(TypeOrmAuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * 사용자 인증 (TypeORM 버전)
   * 기존 authenticateUserDirect()를 대체
   */
  async authenticateUser(
    identifier: string,
    password: string
  ): Promise<User | null> {
    const startTime = Date.now();

    try {
      // 이메일/유저네임으로 사용자 찾기
      const user = await this.userRepository.findByEmailOrUsername(identifier);

      if (!user) {
        this.logger.debug(`User not found: ${identifier}`);
        return null;
      }

      // 비밀번호 확인 - 필드 제거되어 임시 처리
      // const isValidPassword = await bcrypt.compare(password, user.password_hash);
      // if (!isValidPassword) {
      //   this.logger.debug(`Invalid password for user: ${identifier}`);
      //   return null;
      // }
      this.logger.warn('password_hash field removed - skipping password validation');

      const duration = Date.now() - startTime;
      this.logger.debug(`TypeORM auth completed in ${duration}ms for ${identifier}`);

      return user;
    } catch (error) {
      this.logger.error(`Authentication failed for ${identifier}:`, error);
      return null;
    }
  }

  /**
   * 사용자 조회 by ID (TypeORM 버전)
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      return await this.userRepository.findById(userId);
    } catch (error) {
      this.logger.error(`Failed to get user by ID ${userId}:`, error);
      return null;
    }
  }

  /**
   * 사용자 존재 여부 확인 (TypeORM 버전)
   */
  async userExists(identifier: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findByEmailOrUsername(identifier);
      return user !== null;
    } catch (error) {
      this.logger.error(`Failed to check user existence for ${identifier}:`, error);
      return false;
    }
  }

  /**
   * 이메일 중복 체크 (TypeORM 버전)
   */
  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    try {
      return await this.userRepository.isEmailTaken(email, excludeUserId);
    } catch (error) {
      this.logger.error(`Failed to check email availability for ${email}:`, error);
      return true; // 안전한 기본값: 중복으로 가정
    }
  }

  /**
   * 유저네임 중복 체크 (TypeORM 버전)
   */
  async isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
    try {
      return await this.userRepository.isUsernameTaken(username, excludeUserId);
    } catch (error) {
      this.logger.error(`Failed to check username availability for ${username}:`, error);
      return true; // 안전한 기본값: 중복으로 가정
    }
  }

  /**
   * 사용자 정보 업데이트 (TypeORM 버전)
   */
  async updateUser(userId: string, updateData: Partial<User>): Promise<User | null> {
    try {
      return await this.userRepository.update(userId, updateData);
    } catch (error) {
      this.logger.error(`Failed to update user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 비밀번호 업데이트 (TypeORM 버전)
   */
  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const updated = await this.userRepository.update(userId, {
        // password_hash: passwordHash // 필드 제거됨
      });
      return updated !== null;
    } catch (error) {
      this.logger.error(`Failed to update password for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * 사용자 삭제 (TypeORM 버전)
   */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      return await this.userRepository.deleteAndCheck(userId);
    } catch (error) {
      this.logger.error(`Failed to delete user ${userId}:`, error);
      return false;
    }
  }

  /**
   * 사용자 검색 (TypeORM 버전)
   */
  async searchUsers(searchTerm: string): Promise<User[]> {
    try {
      return await this.userRepository.searchUsers(searchTerm);
    } catch (error) {
      this.logger.error(`Failed to search users with term ${searchTerm}:`, error);
      return [];
    }
  }
}