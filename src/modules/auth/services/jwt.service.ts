import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { JwtBlacklistRepository } from '../repositories/jwt-blacklist.repository';

export interface JwtPayload {
  sub: number; // memberId
  email: string;
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for blacklist
}

@Injectable()
export class JwtService {
  constructor(
    private readonly nestJwtService: NestJwtService,
    private readonly blacklistRepository: JwtBlacklistRepository,
  ) {}

  async generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>): Promise<string> {
    const jti = this.generateJti();
    const fullPayload: JwtPayload = {
      ...payload,
      jti,
    };

    return this.nestJwtService.sign(fullPayload, {
      expiresIn: '15m',
    });
  }

  async generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>): Promise<string> {
    const jti = this.generateJti();
    const fullPayload: JwtPayload = {
      ...payload,
      jti,
    };

    return this.nestJwtService.sign(fullPayload, {
      expiresIn: '7d',
    });
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    const payload = this.nestJwtService.verify<JwtPayload>(token);

    // 블랙리스트 확인
    if (payload.jti && await this.blacklistRepository.isBlacklisted(payload.jti)) {
      throw new Error('Token has been blacklisted');
    }

    return payload;
  }

  async blacklistToken(token: string, reason: string = 'logout'): Promise<void> {
    try {
      const payload = this.nestJwtService.decode(token) as JwtPayload;
      if (payload?.jti) {
        await this.blacklistRepository.addToBlacklist({
          tokenId: payload.jti,
          userId: payload.sub.toString(),
          expiresAt: new Date(payload.exp! * 1000),
          reason: reason as any,
        });
      }
    } catch (error) {
      // 토큰이 유효하지 않아도 블랙리스트 처리는 시도
    }
  }

  private generateJti(): string {
    return Math.random().toString(36).substring(2, 15) +
           Date.now().toString(36);
  }
}