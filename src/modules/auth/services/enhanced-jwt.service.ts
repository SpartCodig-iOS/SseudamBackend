import { Injectable } from '@nestjs/common';
import { JwtTokenService } from '../../jwt-shared/services/jwtService';
import { TypeOrmJwtBlacklistService } from './typeorm-jwt-blacklist.service';

@Injectable()
export class EnhancedJwtService {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly jwtBlacklistService: TypeOrmJwtBlacklistService,
  ) {}

  async verifyAccessToken(token: string): Promise<any> {
    // Check if token is blacklisted
    const isBlacklisted = await this.jwtBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      throw new Error('Token is blacklisted');
    }

    // Verify token
    return this.jwtTokenService.verifyAccessToken(token);
  }

  async verifyRefreshToken(token: string): Promise<any> {
    // Check if token is blacklisted
    const isBlacklisted = await this.jwtBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      throw new Error('Token is blacklisted');
    }

    // Verify token
    return this.jwtTokenService.verifyRefreshToken(token);
  }

  async invalidateToken(token: string, expiresAt?: Date): Promise<void> {
    // Extract token ID for blacklisting (simplified - use whole token as ID)
    const tokenId = token.slice(-16); // Use last 16 chars as ID
    await this.jwtBlacklistService.addToBlacklist(
      tokenId,
      'unknown',
      expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
    );
  }
}