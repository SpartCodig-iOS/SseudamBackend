import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/user/entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    await this.userRepository.update(id, userData);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async save(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  async findOne(options: any): Promise<User | null> {
    return this.userRepository.findOne(options);
  }

  async count(): Promise<number> {
    return this.userRepository.count();
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  getRepository() {
    return this.userRepository;
  }

  async findSocialProfileInfo(userId: string): Promise<any> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async deleteAccountData(userId: string): Promise<void> {
    await this.userRepository.delete(userId);
  }

  async markLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() });
  }
}