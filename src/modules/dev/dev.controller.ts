import { Controller, Post, Body, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { JwtTokenService } from '../../services/jwtService';
import { APNSService } from '../../services/apns.service';
import { DeviceTokenService } from '../../services/device-token.service';
import { env } from '../../config/env';
import { success } from '../../types/api';
import { UserRole } from '../../types/user';
import { randomUUID } from 'crypto';

@ApiTags('Development')
@Controller('api/v1/dev')
export class DevController {
  constructor(
    private readonly jwtService: JwtTokenService,
    private readonly apnsService: APNSService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

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
      id: 'e11cc73b-052d-4740-8213-999c05bfc332', // 실제 DB에 있는 테스트 사용자 ID
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

  @Post('test-push-notification')
  @ApiOperation({
    summary: '푸시 알림 테스트',
    description: '실제 디바이스 토큰으로 푸시 알림을 테스트할 수 있는 API'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['deviceToken', 'title', 'body'],
      properties: {
        deviceToken: {
          type: 'string',
          example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
          description: '실제 iOS 디바이스 토큰 (64자리 hex 문자열)'
        },
        title: {
          type: 'string',
          example: '테스트 알림',
          description: '푸시 알림 제목'
        },
        body: {
          type: 'string',
          example: '이것은 푸시 알림 테스트입니다!',
          description: '푸시 알림 내용'
        },
        data: {
          type: 'object',
          description: '추가 데이터 (선택사항)',
          properties: {
            type: { type: 'string', example: 'test' },
            travelId: { type: 'string', example: 'fbde676c-4cad-4f6d-bede-93c58565b301' }
          }
        },
        badge: {
          type: 'number',
          example: 1,
          description: '앱 아이콘 배지 숫자 (선택사항)'
        },
        sound: {
          type: 'string',
          example: 'default',
          description: '알림 사운드 (선택사항)'
        }
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '푸시 알림 테스트 성공',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Push notification test completed' },
        data: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            deviceToken: { type: 'string', example: 'fe13ccdb...' },
            result: { type: 'string', example: 'Notification sent successfully' }
          },
        },
      },
    },
  })
  async testPushNotification(@Body() body: {
    deviceToken: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    badge?: number;
    sound?: string;
  }) {
    try {
      // 디바이스 토큰 유효성 검사
      if (!body.deviceToken || body.deviceToken.length < 60) {
        throw new BadRequestException('Invalid device token format');
      }

      if (!body.title || !body.body) {
        throw new BadRequestException('Title and body are required');
      }

      // APNS로 직접 푸시 알림 전송
      const result = await this.apnsService.sendNotification({
        deviceToken: body.deviceToken,
        title: body.title,
        body: body.body,
        data: {
          type: 'test',
          testTime: new Date().toISOString(),
          ...body.data
        },
        badge: body.badge,
        sound: body.sound || 'default'
      });

      return success(
        {
          success: result,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          result: result ? 'Notification sent successfully' : 'Notification failed to send',
          timestamp: new Date().toISOString()
        },
        'Push notification test completed'
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return success(
        {
          success: false,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          result: `Error: ${errorMessage}`,
          timestamp: new Date().toISOString()
        },
        'Push notification test failed'
      );
    }
  }

  @Post('register-test-device')
  @ApiOperation({
    summary: '테스트 디바이스 토큰 등록',
    description: '특정 사용자에게 테스트용 디바이스 토큰을 등록하는 API'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'deviceToken'],
      properties: {
        userId: {
          type: 'string',
          example: 'e11cc73b-052d-4740-8213-999c05bfc332',
          description: '사용자 ID'
        },
        deviceToken: {
          type: 'string',
          example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
          description: '실제 iOS 디바이스 토큰'
        }
      },
    },
  })
  async registerTestDevice(@Body() body: { userId: string; deviceToken: string }) {
    try {
      if (!body.userId || !body.deviceToken) {
        throw new BadRequestException('userId and deviceToken are required');
      }

      // 디바이스 토큰 등록
      await this.deviceTokenService.upsertDeviceToken(body.userId, body.deviceToken);

      return success(
        {
          userId: body.userId,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          registered: true
        },
        'Test device token registered successfully'
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return success(
        {
          userId: body.userId,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          registered: false,
          error: errorMessage
        },
        'Failed to register test device token'
      );
    }
  }
}