import { Controller, Post, Body, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { JwtTokenService } from '../../services/jwtService';
import { env } from '../../config/env';
import { success } from '../../types/api';
import { UserRole } from '../../types/user';
import { randomUUID } from 'crypto';

// 개발 환경이 아니면 이 컨트롤러를 완전히 숨김
@ApiExcludeController()
@ApiTags('Development')
@Controller('api/v1/dev')
export class DevController {
  constructor(private readonly jwtService: JwtTokenService) {}

  @Post('infinite-token')
  @ApiOperation({
    summary: '개발용 무한토큰 생성',
    description: '개발 환경에서만 사용 가능한 테스트용 무한토큰 생성'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['id', 'password'],
      properties: {
        id: { type: 'string', example: 'test' },
        password: { type: 'string', example: 'test123!' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '무한토큰 생성 성공',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Infinite token generated' },
        data: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string' },
              },
            },
          },
        },
      },
    },
  })
  async generateInfiniteToken(@Body() body: { id: string; password: string }) {
    // 임시로 모든 환경에서 허용 (TODO: 나중에 제거 예정)
    // if (env.nodeEnv !== 'development') {
    //   throw new ForbiddenException('This endpoint is only available in development environment');
    // }

    // 하드코딩된 테스트 계정 확인
    if (body.id !== 'test' || body.password !== 'test123!') {
      throw new BadRequestException('Invalid test credentials');
    }

    // 테스트용 가짜 유저 데이터
    const testUser = {
      id: 'test-user-id-12345',
      email: 'test@example.com',
      password_hash: 'fake-hash',
      name: '테스트 사용자',
      avatar_url: null,
      username: 'testuser',
      role: 'user' as UserRole,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const sessionId = randomUUID();
    const infiniteToken = this.jwtService.generateInfiniteToken(testUser, sessionId);

    return success(
      {
        accessToken: infiniteToken,
        user: {
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          role: testUser.role,
        },
      },
      'Infinite token generated for testing'
    );
  }
}