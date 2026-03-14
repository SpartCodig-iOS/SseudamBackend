import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { DeviceTokenEntity } from '../entities/device-token.entity';

@Injectable()
export class DeviceTokenRepository {
  constructor(
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenRepository: Repository<DeviceTokenEntity>,
  ) {}

  async registerPendingDeviceToken(data: {
    pendingKey: string;
    deviceToken: string;
    platform: 'ios' | 'android';
    deviceId?: string;
    appVersion?: string;
  }): Promise<void> {
    await this.deviceTokenRepository.upsert(
      {
        userId: null,
        pendingKey: data.pendingKey,
        deviceToken: data.deviceToken,
        platform: data.platform,
        deviceId: data.deviceId,
        appVersion: data.appVersion,
        isActive: true,
        lastUsedAt: new Date(),
      },
      ['deviceToken'], // ON CONFLICT (device_token)
    );
  }

  async upsertDeviceToken(data: {
    userId: string;
    deviceToken: string;
    platform: 'ios' | 'android';
    deviceId?: string;
    appVersion?: string;
  }): Promise<void> {
    await this.deviceTokenRepository.upsert(
      {
        userId: data.userId,
        pendingKey: null, // Clear pending key when associating with user
        deviceToken: data.deviceToken,
        platform: data.platform,
        deviceId: data.deviceId,
        appVersion: data.appVersion,
        isActive: true,
        lastUsedAt: new Date(),
      },
      ['deviceToken'], // ON CONFLICT (device_token)
    );
  }

  async findActiveTokensByUserId(userId: string): Promise<string[]> {
    const tokens = await this.deviceTokenRepository.find({
      where: {
        userId,
        isActive: true,
      },
      select: ['deviceToken'],
      order: { lastUsedAt: 'DESC' },
    });

    return tokens.map(t => t.deviceToken);
  }

  async findActiveTokensByUserIds(userIds: string[]): Promise<Map<string, string[]>> {
    const tokens = await this.deviceTokenRepository.find({
      where: {
        userId: In(userIds),
        isActive: true,
      },
      select: ['userId', 'deviceToken'],
    });

    const result = new Map<string, string[]>();
    for (const token of tokens) {
      if (token.userId) {
        if (!result.has(token.userId)) {
          result.set(token.userId, []);
        }
        result.get(token.userId)!.push(token.deviceToken);
      }
    }

    return result;
  }

  async deactivateByToken(deviceToken: string): Promise<void> {
    await this.deviceTokenRepository.update(
      { deviceToken },
      { isActive: false }
    );
  }

  async deactivateAllUserTokens(userId: string): Promise<number> {
    const result = await this.deviceTokenRepository.update(
      { userId, isActive: true },
      { isActive: false }
    );

    return result.affected || 0;
  }

  async cleanupInactiveTokens(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.deviceTokenRepository.delete({
      isActive: false,
      updatedAt: LessThan(thirtyDaysAgo),
    });

    return result.affected || 0;
  }

  async linkPendingToUser(pendingKey: string, userId: string): Promise<boolean> {
    const result = await this.deviceTokenRepository.update(
      { pendingKey },
      { userId, pendingKey: null }
    );

    return (result.affected || 0) > 0;
  }

  async findByPendingKey(pendingKey: string): Promise<DeviceTokenEntity | null> {
    return this.deviceTokenRepository.findOne({
      where: { pendingKey },
    });
  }
}