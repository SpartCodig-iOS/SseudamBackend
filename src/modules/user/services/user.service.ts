import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { User } from '../entities/user.entity';
import { UserRoleEnum as UserRole } from '../types/user.types';
import { UserRole as GlobalUserRole } from '../../../types/user.types';
import * as bcrypt from 'bcryptjs';

export interface CreateUserDto {
  email: string;
  password: string;
  name?: string;
  username: string;
  role?: UserRole;
}

export interface UpdateUserDto {
  name?: string;
  username?: string;
  avatar_url?: string;
  role?: UserRole | string;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * 새로운 사용자 생성
   */
  async createUser(dto: CreateUserDto): Promise<User> {
    const { email, password, name, username, role = 'user' } = dto;

    // 이메일과 유저네임 중복 체크
    const emailExists = await this.userRepository.isEmailTaken(email);
    if (emailExists) {
      throw new ConflictException('Email already exists');
    }

    const usernameExists = await this.userRepository.isUsernameTaken(username);
    if (usernameExists) {
      throw new ConflictException('Username already exists');
    }

    // 비밀번호 해싱 - 필드 제거됨
    // const password_hash = await bcrypt.hash(password, 10);

    const newUser = await this.userRepository.create({
      email: email.toLowerCase(),
      // password_hash, // 필드 제거됨
      name: name || null,
      username: username.toLowerCase(),
      role,
      avatar_url: null,
    });

    this.logger.log(`User created: ${newUser.email} (${newUser.id})`);
    return newUser;
  }

  /**
   * ID로 사용자 조회
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * 이메일로 사용자 조회
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email.toLowerCase());
  }

  /**
   * 유저네임으로 사용자 조회
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findByUsername(username.toLowerCase());
  }

  /**
   * 이메일 또는 유저네임으로 사용자 조회
   */
  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.userRepository.findByEmailOrUsername(identifier.toLowerCase());
  }

  /**
   * 사용자 정보 업데이트
   */
  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const existingUser = await this.findById(id);

    // 유저네임 중복 체크 (현재 사용자 제외)
    if (dto.username) {
      const usernameExists = await this.userRepository.isUsernameTaken(
        dto.username,
        id
      );
      if (usernameExists) {
        throw new ConflictException('Username already exists');
      }
      dto.username = dto.username.toLowerCase();
    }

    const sanitizedDto = { ...dto };
    if (sanitizedDto.role && typeof sanitizedDto.role === 'string') {
      sanitizedDto.role = sanitizedDto.role as UserRole;
    }
    const updatedUser = await this.userRepository.update(id, sanitizedDto as Partial<User>);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(`User updated: ${updatedUser.email} (${id})`);
    return updatedUser;
  }

  /**
   * 프로필 업데이트 (updateProfile 별칭)
   */
  async updateProfile(id: string, dto: UpdateUserDto): Promise<User> {
    return this.updateUser(id, dto);
  }

  /**
   * 사용자 삭제
   */
  async deleteUser(id: string): Promise<void> {
    const user = await this.findById(id);

    await this.userRepository.delete(id);

    this.logger.log(`User deleted: ${user.email} (${id})`);
  }

  /**
   * 비밀번호 업데이트
   */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    // const password_hash = await bcrypt.hash(newPassword, 10);
    // await this.userRepository.update(id, { password_hash }); // 필드 제거됨
    throw new Error('Password update not supported - password_hash field removed');

    this.logger.log(`Password updated for user: ${id}`);
  }

  /**
   * 비밀번호 확인
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    // return bcrypt.compare(password, user.password_hash); // 필드 제거됨
    throw new Error('Password verification not supported - password_hash field removed');
  }

  /**
   * 사용자 검색
   */
  async searchUsers(searchTerm: string, limit: number = 10): Promise<User[]> {
    return this.userRepository.searchUsers(searchTerm);
  }

  /**
   * 사용자 통계 조회
   */
  async getUserStats(userId: string): Promise<{
    totalTravels: number;
    totalExpenses: number;
  }> {
    const repoStats = await this.userRepository.getUserStats();
    return {
      totalTravels: repoStats.totalUsers, // 임시로 사용자 수를 여행 수로 매핑
      totalExpenses: repoStats.activeUsers, // 임시로 활성 사용자 수를 비용 수로 매핑
    };
  }

  /**
   * 여러 사용자 ID로 사용자 정보 조회
   */
  async findUsersByIds(userIds: string[]): Promise<User[]> {
    return this.userRepository.findUsersById(userIds);
  }

  /**
   * 사용자 목록 조회 (페이지네이션)
   */
  async findUsers(
    page: number = 1,
    limit: number = 20,
    search?: string
  ): Promise<[User[], number]> {
    const result = await this.userRepository.findAndCount({ page, limit, search });
    return [result.users, result.total];
  }

  /**
   * 활성 사용자 수 조회
   */
  async getActiveUserCount(): Promise<number> {
    // 여기서는 간단히 전체 사용자 수를 반환
    // 실제로는 최근 활동 기준으로 필터링할 수 있습니다
    return this.userRepository.count();
  }

  /**
   * 사용자 역할 업데이트
   */
  async updateUserRole(id: string, role: GlobalUserRole | UserRole): Promise<User> {
    return this.updateUser(id, { role: role as any });
  }
}