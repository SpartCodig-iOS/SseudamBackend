import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRecord } from '../../../types/user';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async countUsers(): Promise<number> {
    return this.userRepository.count();
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    return user ? this.mapEntityToRecord(user) : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findOne({
      where: { username: username.toLowerCase() },
    });

    return user ? this.mapEntityToRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
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
      passwordHash: params.passwordHash,
      name: params.name,
      avatarUrl: params.avatarURL,
      username: params.username,
      role: params.role ?? 'user',
    });

    const savedUser = await this.userRepository.save(newUser);
    return this.mapEntityToRecord(savedUser);
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete({ id });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<UserRecord | null> {
    await this.userRepository.update({ id }, updates);
    return this.findById(id);
  }

  async findUsersByRole(role: string): Promise<UserRecord[]> {
    const users = await this.userRepository.find({
      where: { role },
      order: { createdAt: 'DESC' },
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
      order: { createdAt: 'DESC' },
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
      password_hash: user.passwordHash,
      name: user.name,
      avatar_url: user.avatarUrl,
      username: user.username,
      role: user.role ?? 'user',
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }
}