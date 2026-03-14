import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRecord } from '../domain/types/user.types';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async countUsers(): Promise<number> {
    return this.userRepository.count();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  // Legacy methods that return UserRecord for backward compatibility
  async findByEmailAsRecord(email: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    return user ? this.mapEntityToRecord(user) : null;
  }

  async findByUsernameAsRecord(username: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findOne({
      where: { username: username.toLowerCase() },
    });

    return user ? this.mapEntityToRecord(user) : null;
  }

  async findByIdAsRecord(id: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    return user ? this.mapEntityToRecord(user) : null;
  }

  async createUser(params: {
    email: string;
    passwordHash: string;
    name?: string | null;
    avatarURL?: string | null;
    username: string;
    role?: string;
  }): Promise<UserRecord> {
    const newUser = this.userRepository.create({
      email: params.email,
      // password_hash: params.passwordHash, // 필드 제거됨
      name: params.name,
      avatar_url: params.avatarURL,
      username: params.username,
      role: params.role as any ?? 'user',
    });

    const savedUser = await this.userRepository.save(newUser);
    return this.mapEntityToRecord(savedUser);
  }

  async create(userData: Partial<User>): Promise<User> {
    const newUser = this.userRepository.create(userData);
    return this.userRepository.save(newUser);
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    await this.userRepository.update({ id }, userData);
    return this.findById(id);
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    });
  }

  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    let query = this.userRepository.createQueryBuilder('user')
      .where('user.email = :email', { email: email.toLowerCase() });

    if (excludeUserId) {
      query = query.andWhere('user.id != :excludeUserId', { excludeUserId });
    }

    const count = await query.getCount();
    return count > 0;
  }

  async isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
    let query = this.userRepository.createQueryBuilder('user')
      .where('user.username = :username', { username: username.toLowerCase() });

    if (excludeUserId) {
      query = query.andWhere('user.id != :excludeUserId', { excludeUserId });
    }

    const count = await query.getCount();
    return count > 0;
  }

  async delete(id: string): Promise<void> {
    await this.userRepository.delete({ id });
  }

  async deleteAndCheck(id: string): Promise<boolean> {
    const result = await this.userRepository.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  async searchUsers(query: string): Promise<User[]> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.name ILIKE :query OR user.email ILIKE :query OR user.username ILIKE :query', {
        query: `%${query}%`
      })
      .getMany();
  }

  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    newUsersToday: number;
  }> {
    const total = await this.userRepository.count();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newToday = await this.userRepository.count({
      where: {
        created_at: MoreThanOrEqual(today)
      }
    });

    return {
      totalUsers: total,
      activeUsers: total, // For simplicity, consider all users as active
      newUsersToday: newToday
    };
  }

  async findUsersById(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.userRepository.findBy({ id: In(ids) });
  }

  async findAndCount(options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{ users: User[]; total: number }> {
    const { page = 1, limit = 20, search } = options;

    let query = this.userRepository.createQueryBuilder('user');

    if (search) {
      query = query.where(
        'user.name ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search',
        { search: `%${search}%` }
      );
    }

    const [users, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.created_at', 'DESC')
      .getManyAndCount();

    return { users, total };
  }

  async count(): Promise<number> {
    return this.userRepository.count();
  }

  getRepository() {
    return this.userRepository;
  }

  async findSocialProfileInfo(userId: string): Promise<any> {
    // Implementation for social profile info lookup
    const user = await this.findById(userId);
    return user ? {
      // apple_refresh_token: user.apple_refresh_token, // 필드 제거됨
      // google_refresh_token: user.google_refresh_token // 필드 제거됨
    } : null;
  }

  async deleteAccountData(userId: string): Promise<void> {
    await this.delete(userId);
  }

  async markLastLogin(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, {
      updated_at: new Date(),
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete({ id });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    await this.userRepository.update({ id }, updates);
    return this.findById(id);
  }

  async findUsersByRole(role: string): Promise<UserRecord[]> {
    const users = await this.userRepository.find({
      where: { role: role as any },
      order: { created_at: 'DESC' },
    });

    return users.map(this.mapEntityToRecord);
  }

  async findUsersWithPagination(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: UserRecord[]; total: number; page: number; limit: number }> {
    const [users, total] = await this.userRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    return {
      users: users.map(this.mapEntityToRecord),
      total,
      page,
      limit,
    };
  }

  private mapEntityToRecord(user: User): UserRecord {
    return {
      id: user.id,
      email: user.email,
      // password_hash: user.password_hash, // 필드 제거됨
      name: user.name || undefined,
      avatar_url: user.avatar_url || undefined,
      username: user.username,
      role: user.role ?? 'user',
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}