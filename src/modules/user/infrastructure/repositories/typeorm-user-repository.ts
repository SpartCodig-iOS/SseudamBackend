import { Injectable, Inject } from '@nestjs/common';
import { UserRepository } from '../modules/user/repositories/user.repository';
import { UserRecord } from '../types/user';

/**
 * TypeORM-based replacement for the legacy userRepository utility functions
 * This provides the same interface as the old utility functions but uses TypeORM underneath
 */
@Injectable()
export class TypeOrmUserRepository {
  constructor(private readonly userRepository: UserRepository) {}

  async countUsers(): Promise<number> {
    return this.userRepository.countUsers();
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.userRepository.findByEmail(email);
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    return this.userRepository.findByUsername(username);
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.userRepository.findById(id);
  }

  async createUser(params: {
    email: string;
    passwordHash: string;
    name?: string | null;
    avatarURL?: string | null;
    username: string;
    role?: string;
  }): Promise<UserRecord> {
    return this.userRepository.createUser(params);
  }

  async deleteUser(id: string): Promise<void> {
    return this.userRepository.deleteUser(id);
  }
}

// Static functions that can be used as direct replacements for the old utility functions
// Note: These should be used transitionally until all code is refactored to use DI

let userRepositoryInstance: TypeOrmUserRepository | null = null;

export function setUserRepositoryInstance(instance: TypeOrmUserRepository) {
  userRepositoryInstance = instance;
}

export const countUsers = async (): Promise<number> => {
  if (!userRepositoryInstance) {
    throw new Error('UserRepository instance not set. Use setUserRepositoryInstance first.');
  }
  return userRepositoryInstance.countUsers();
};

export const findByEmail = async (email: string): Promise<UserRecord | null> => {
  if (!userRepositoryInstance) {
    throw new Error('UserRepository instance not set. Use setUserRepositoryInstance first.');
  }
  return userRepositoryInstance.findByEmail(email);
};

export const findByUsername = async (username: string): Promise<UserRecord | null> => {
  if (!userRepositoryInstance) {
    throw new Error('UserRepository instance not set. Use setUserRepositoryInstance first.');
  }
  return userRepositoryInstance.findByUsername(username);
};

export const findById = async (id: string): Promise<UserRecord | null> => {
  if (!userRepositoryInstance) {
    throw new Error('UserRepository instance not set. Use setUserRepositoryInstance first.');
  }
  return userRepositoryInstance.findById(id);
};

export const createUser = async (params: {
  email: string;
  passwordHash: string;
  name?: string | null;
  avatarURL?: string | null;
  username: string;
  role?: string;
}): Promise<UserRecord> => {
  if (!userRepositoryInstance) {
    throw new Error('UserRepository instance not set. Use setUserRepositoryInstance first.');
  }
  return userRepositoryInstance.createUser(params);
};

export const deleteUser = async (id: string): Promise<void> => {
  if (!userRepositoryInstance) {
    throw new Error('UserRepository instance not set. Use setUserRepositoryInstance first.');
  }
  return userRepositoryInstance.deleteUser(id);
};