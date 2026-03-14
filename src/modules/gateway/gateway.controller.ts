import { Controller, Post, Body, HttpException, HttpStatus, Logger, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { GatewayService, GatewayRequest, GatewayResponse, TypeOrmGatewayService, ValidationResult } from './services';
import { Request } from 'express';

export class GatewayValidateDto {
  method!: string;
  path!: string;
  headers!: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  ip!: string;
  userAgent?: string;
}

@ApiTags('Gateway')
@Controller('api/v1/gateway')
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(
    private readonly gatewayService: GatewayService,
    private readonly typeOrmGatewayService: TypeOrmGatewayService,
  ) {}

  /**
   * 요청 검증 엔드포인트 - 다른 서비스에서 호출
   */
  @Post('validate')
  @ApiOperation({
    summary: '요청 인증 및 권한 검증',
    description: '마이크로서비스 아키텍처에서 다른 서비스가 요청 검증을 위해 호출하는 엔드포인트',
  })
  @ApiBody({ type: GatewayValidateDto })
  @ApiResponse({
    status: 200,
    description: '검증 결과',
    schema: {
      type: 'object',
      properties: {
        allowed: { type: 'boolean' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
          },
        },
        reason: { type: 'string' },
        rateLimitInfo: {
          type: 'object',
          properties: {
            remaining: { type: 'number' },
            resetTime: { type: 'number' },
          },
        },
      },
    },
  })
  async validateRequest(@Body() requestData: GatewayValidateDto): Promise<GatewayResponse> {
    try {
      const gatewayRequest: GatewayRequest = {
        method: requestData.method,
        path: requestData.path,
        headers: requestData.headers,
        body: requestData.body,
        query: requestData.query,
        ip: requestData.ip,
        userAgent: requestData.userAgent,
      };

      const result = await this.gatewayService.validateRequest(gatewayRequest);

      // 로깅 (성공/실패 모두)
      if (result.allowed) {
        this.logger.log(`Request allowed: ${requestData.method} ${requestData.path} - User: ${result.user?.id || 'anonymous'}`);
      } else {
        this.logger.warn(`Request blocked: ${requestData.method} ${requestData.path} - Reason: ${result.reason}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Gateway validation error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw new HttpException(
        {
          allowed: false,
          reason: 'Gateway service error',
          message: 'Internal gateway validation error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 현재 요청의 인증 상태 확인 (미들웨어용)
   */
  @Post('check-auth')
  @ApiOperation({
    summary: '현재 요청의 인증 상태 확인',
    description: 'Gateway 미들웨어에서 사용하는 내부 엔드포인트',
  })
  async checkCurrentAuth(@Req() req: Request, @Headers() headers: Record<string, string>): Promise<GatewayResponse> {
    const gatewayRequest: GatewayRequest = {
      method: req.method,
      path: req.path,
      headers,
      body: req.body,
      query: req.query as Record<string, string>,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent'),
    };

    return this.gatewayService.validateRequest(gatewayRequest);
  }

  /**
   * Gateway 상태 및 통계 조회
   */
  @Post('stats')
  @ApiOperation({
    summary: 'Gateway 통계 조회',
    description: 'Gateway의 현재 상태와 통계 정보를 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Gateway 통계 정보',
    schema: {
      type: 'object',
      properties: {
        totalRequests: { type: 'number' },
        blockedRequests: { type: 'number' },
        topBlockReasons: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
        rateLimitHits: { type: 'number' },
        authFailures: { type: 'number' },
      },
    },
  })
  async getGatewayStats() {
    try {
      return await this.gatewayService.getGatewayStats();
    } catch (error) {
      this.logger.error(`Failed to get gateway stats: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException(
        {
          message: 'Failed to retrieve gateway statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * IP를 의심스러운 목록에 추가
   */
  @Post('block-ip')
  @ApiOperation({
    summary: '의심스러운 IP 차단',
    description: '특정 IP를 의심스러운 목록에 추가하여 일시적으로 차단합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: '차단할 IP 주소' },
        reason: { type: 'string', description: '차단 사유' },
        ttlSeconds: { type: 'number', description: '차단 지속 시간 (초)', default: 3600 },
      },
      required: ['ip', 'reason'],
    },
  })
  async blockSuspiciousIP(@Body() body: { ip: string; reason: string; ttlSeconds?: number }) {
    try {
      await this.gatewayService.addSuspiciousIP(body.ip, body.reason, body.ttlSeconds);
      return { success: true, message: `IP ${body.ip} has been added to suspicious list` };
    } catch (error) {
      this.logger.error(`Failed to block IP ${body.ip}: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException(
        {
          message: 'Failed to block IP address',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 계정 잠금
   */
  @Post('lock-account')
  @ApiOperation({
    summary: '계정 잠금',
    description: '특정 사용자 계정을 일시적으로 잠급니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '잠금할 사용자 ID' },
        reason: { type: 'string', description: '잠금 사유' },
        ttlSeconds: { type: 'number', description: '잠금 지속 시간 (초)', default: 1800 },
      },
      required: ['userId', 'reason'],
    },
  })
  async lockUserAccount(@Body() body: { userId: string; reason: string; ttlSeconds?: number }) {
    try {
      await this.gatewayService.lockAccount(body.userId, body.reason, body.ttlSeconds);
      return { success: true, message: `Account ${body.userId} has been locked` };
    } catch (error) {
      this.logger.error(`Failed to lock account ${body.userId}: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException(
        {
          message: 'Failed to lock user account',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * TypeORM 기반 요청 검증 (새로운 엔드포인트)
   */
  @Post('validate-typeorm')
  @ApiOperation({
    summary: 'TypeORM 기반 요청 인증 및 권한 검증',
    description: 'TypeORM과 JWT 블랙리스트를 사용한 요청 검증',
  })
  @ApiBody({ type: GatewayValidateDto })
  @ApiResponse({
    status: 200,
    description: '검증 결과',
    schema: {
      type: 'object',
      properties: {
        allowed: { type: 'boolean' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        },
        reason: { type: 'string' },
        rateLimitInfo: {
          type: 'object',
          properties: {
            remaining: { type: 'number' },
            resetTime: { type: 'number' },
          },
        },
      },
    },
  })
  async validateRequestTypeORM(@Body() requestData: GatewayValidateDto): Promise<ValidationResult> {
    try {
      const result = await this.typeOrmGatewayService.validateRequest(requestData);

      // 로깅 (성공/실패 모두)
      if (result.allowed) {
        this.logger.log(`Request allowed: ${requestData.method} ${requestData.path} - User: ${result.user?.id || 'anonymous'}`);
      } else {
        this.logger.warn(`Request blocked: ${requestData.method} ${requestData.path} - Reason: ${result.reason}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`TypeORM Gateway validation error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw new HttpException(
        {
          allowed: false,
          reason: 'Gateway service error',
          message: 'Internal gateway validation error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * TypeORM 기반 IP 차단
   */
  @Post('block-ip-typeorm')
  @ApiOperation({
    summary: 'TypeORM 기반 IP 차단',
    description: 'TypeORM을 사용하여 특정 IP를 차단합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: '차단할 IP 주소' },
        reason: { type: 'string', description: '차단 사유' },
        duration: { type: 'number', description: '차단 지속 시간 (초)', default: 3600 },
      },
      required: ['ip', 'reason'],
    },
  })
  async blockIPTypeORM(@Body() body: { ip: string; reason: string; duration?: number }) {
    try {
      await this.typeOrmGatewayService.blockIP(body.ip, body.reason, body.duration);
      return { success: true, message: `IP ${body.ip} has been blocked` };
    } catch (error) {
      this.logger.error(`Failed to block IP ${body.ip}: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException(
        {
          message: 'Failed to block IP address',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * TypeORM 기반 계정 잠금
   */
  @Post('lock-account-typeorm')
  @ApiOperation({
    summary: 'TypeORM 기반 계정 잠금',
    description: 'TypeORM을 사용하여 특정 사용자 계정의 모든 토큰을 블랙리스트 처리합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '잠금할 사용자 ID' },
        reason: { type: 'string', description: '잠금 사유' },
      },
      required: ['userId', 'reason'],
    },
  })
  async lockAccountTypeORM(@Body() body: { userId: string; reason: string }) {
    try {
      await this.typeOrmGatewayService.lockAccount(body.userId, body.reason);
      return { success: true, message: `Account ${body.userId} tokens have been blacklisted` };
    } catch (error) {
      this.logger.error(`Failed to lock account ${body.userId}: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException(
        {
          message: 'Failed to lock user account',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * JWT 블랙리스트 통계 조회
   */
  @Post('blacklist-stats')
  @ApiOperation({
    summary: 'JWT 블랙리스트 통계 조회',
    description: 'TypeORM 기반 JWT 블랙리스트의 통계 정보를 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'JWT 블랙리스트 통계',
    schema: {
      type: 'object',
      properties: {
        totalBlacklisted: { type: 'number' },
        recentBlacklisted: { type: 'number' },
        topReasons: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
      },
    },
  })
  async getBlacklistStats() {
    try {
      // TypeOrmJwtBlacklistService를 통해 통계 조회
      const stats = await this.typeOrmGatewayService.getAuthStats();
      return stats;
    } catch (error) {
      this.logger.error(`Failed to get blacklist stats: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException(
        {
          message: 'Failed to retrieve blacklist statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}