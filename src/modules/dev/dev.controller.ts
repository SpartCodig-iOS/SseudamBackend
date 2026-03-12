import { Controller, Post, Body, BadRequestException, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { APNSService } from '../notification/services/apns.service';
import { DeviceTokenService } from '../oauth/services/device-token.service';
import { PushNotificationService } from '../notification/services/push-notification.service';
import { DeepLinkType, DeepLinkUtils } from '../notification/types/deeplink.types';
import { CacheService } from '../../common/services/cache.service';
import { env } from '../../config/env';
import { success } from '../../common/types/api.types';

@ApiTags('Development')
@ApiExcludeController()
@Controller('api/v1/dev')
export class DevController {
  constructor(
    private readonly apnsService: APNSService,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly cacheService: CacheService,
  ) {
    if (env.nodeEnv === 'production') {
      throw new Error('DevController must not be loaded in production environment');
    }
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
      const result = await this.apnsService.sendNotificationWithResult({
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
          success: result.success,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          result: result.success ? 'Notification sent successfully' : (result.reason || 'Notification failed to send'),
          detail: result.detail ?? null,
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

  @Post('test-deeplink-notification')
  @ApiOperation({
    summary: '딥링크 포함 푸시 알림 테스트',
    description: '딥링크가 포함된 푸시 알림을 테스트하는 API - 실제 푸시 알림 시스템이 딥링크를 제대로 생성하는지 확인'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['deviceToken', 'deepLinkType'],
      properties: {
        deviceToken: {
          type: 'string',
          example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
          description: '실제 iOS 디바이스 토큰'
        },
        deepLinkType: {
          type: 'string',
          enum: ['expense_detail', 'travel_detail', 'travel_invite', 'settlement_result'],
          example: 'expense_detail',
          description: '테스트할 딥링크 타입'
        },
        travelId: {
          type: 'string',
          example: 'fbde676c-4cad-4f6d-bede-93c58565b301',
          description: '여행 ID (expense_detail, travel_detail, settlement_result에 필요)'
        },
        expenseId: {
          type: 'string',
          example: 'dfd16288-6275-4cc0-ab52-f2fc143101ce',
          description: '지출 ID (expense_detail에 필요)'
        },
        inviteCode: {
          type: 'string',
          example: 'a82ed7c6e3',
          description: '초대 코드 (travel_invite에 필요)'
        }
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '딥링크 포함 푸시 알림 테스트 성공',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Deep link push notification test completed' },
        data: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            deviceToken: { type: 'string', example: 'fe13ccdb...' },
            deepLinkType: { type: 'string', example: 'expense_detail' },
            generatedDeepLink: { type: 'string', example: 'sseudam://travel/123/expense/456' },
            notificationPayload: { type: 'object' },
            timestamp: { type: 'string', example: '2025-12-11T10:30:00.000Z' }
          },
        },
      },
    },
  })
  async testDeepLinkNotification(@Body() body: {
    deviceToken: string;
    deepLinkType: 'expense_detail' | 'travel_detail' | 'travel_invite' | 'settlement_result';
    travelId?: string;
    expenseId?: string;
    inviteCode?: string;
  }) {
    try {
      // 입력 검증
      if (!body.deviceToken || body.deviceToken.length < 60) {
        throw new BadRequestException('Invalid device token format');
      }

      // 딥링크 타입별 필수 파라미터 검증
      switch (body.deepLinkType) {
        case 'expense_detail':
          if (!body.travelId || !body.expenseId) {
            throw new BadRequestException('travelId and expenseId are required for expense_detail');
          }
          break;
        case 'travel_detail':
        case 'settlement_result':
          if (!body.travelId) {
            throw new BadRequestException('travelId is required for travel_detail and settlement_result');
          }
          break;
        case 'travel_invite':
          if (!body.inviteCode) {
            throw new BadRequestException('inviteCode is required for travel_invite');
          }
          break;
        default:
          throw new BadRequestException('Invalid deepLinkType');
      }

      // 딥링크 데이터 생성
      const deepLinkData = {
        type: body.deepLinkType as DeepLinkType,
        travelId: body.travelId,
        expenseId: body.expenseId,
        inviteCode: body.inviteCode
      };

      // 딥링크 URL 생성
      const deepLinkUrl = DeepLinkUtils.generateDeepLink(deepLinkData);

      // 푸시 알림 payload 생성 (딥링크 포함)
      const pushPayload = {
        title: '딥링크 테스트 알림',
        body: `${body.deepLinkType} 딥링크가 포함된 테스트 푸시 알림입니다`,
        data: {
          type: 'deeplink_test',
          testType: body.deepLinkType,
          timestamp: new Date().toISOString()
        }
      };

      // 딥링크가 포함된 APNS 페이로드 생성
      const apnsPayload = DeepLinkUtils.createPushPayload(pushPayload, deepLinkData);

      // APNS로 알림 전송
      const result = await this.apnsService.sendNotificationWithResult({
        deviceToken: body.deviceToken,
        title: pushPayload.title,
        body: pushPayload.body,
        data: apnsPayload
      });

      return success(
        {
          success: result.success,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          deepLinkType: body.deepLinkType,
          generatedDeepLink: deepLinkUrl,
          notificationPayload: {
            title: pushPayload.title,
            body: pushPayload.body,
            apsPayload: apnsPayload
          },
          apnsResult: {
            success: result.success,
            reason: result.reason
          },
          timestamp: new Date().toISOString()
        },
        'Deep link push notification test completed'
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return success(
        {
          success: false,
          deviceToken: `${body.deviceToken.substring(0, 8)}...`,
          deepLinkType: body.deepLinkType,
          error: errorMessage,
          timestamp: new Date().toISOString()
        },
        'Deep link push notification test failed'
      );
    }
  }

  @Delete('cache/travel/:travelId')
  @ApiOperation({
    summary: '여행별 캐시 삭제 (개발 전용)',
    description: '특정 여행 ID의 모든 캐시를 삭제합니다. expense, settlement, travel 캐시를 포함합니다.'
  })
  async clearTravelCache(@Param('travelId') travelId: string) {
    try {
      if (!travelId || !travelId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)) {
        throw new BadRequestException('Invalid travel ID format');
      }

      // Clear all travel-related caches
      const patterns = [
        `travel:${travelId}`,
        `travel:${travelId}:*`,
        `expense:list:${travelId}:*`,
        `expense:detail:${travelId}:*`,
        `expense:context:${travelId}`,
        `settlement:${travelId}:*`,
        `members:${travelId}`,
      ];

      let totalDeleted = 0;
      const results = [];

      for (const pattern of patterns) {
        const deleted = await this.cacheService.delPattern(pattern);
        totalDeleted += deleted;
        results.push({ pattern, deleted });
      }

      return success(
        {
          travelId,
          totalDeleted,
          patterns: results,
          timestamp: new Date().toISOString()
        },
        `Cleared ${totalDeleted} cache entries for travel ${travelId}`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return success(
        {
          travelId,
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString()
        },
        'Failed to clear travel cache'
      );
    }
  }

  @Delete('cache/expense/:travelId')
  @ApiOperation({
    summary: '여행 경비 캐시 삭제 (개발 전용)',
    description: '특정 여행의 경비 관련 캐시만 삭제합니다.'
  })
  async clearExpenseCache(@Param('travelId') travelId: string) {
    try {
      if (!travelId || !travelId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)) {
        throw new BadRequestException('Invalid travel ID format');
      }

      // Clear only expense-related caches
      const patterns = [
        `expense:list:${travelId}:*`,
        `expense:detail:${travelId}:*`,
        `expense:context:${travelId}`,
      ];

      let totalDeleted = 0;
      const results = [];

      for (const pattern of patterns) {
        const deleted = await this.cacheService.delPattern(pattern);
        totalDeleted += deleted;
        results.push({ pattern, deleted });
      }

      return success(
        {
          travelId,
          totalDeleted,
          patterns: results,
          timestamp: new Date().toISOString()
        },
        `Cleared ${totalDeleted} expense cache entries for travel ${travelId}`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return success(
        {
          travelId,
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString()
        },
        'Failed to clear expense cache'
      );
    }
  }

  @Delete('cache/all')
  @ApiOperation({
    summary: '전체 캐시 삭제 (개발 전용)',
    description: '모든 캐시를 삭제합니다. Redis와 fallback 메모리 캐시 모두 삭제됩니다.'
  })
  async clearAllCache() {
    try {
      await this.cacheService.flush();

      return success(
        {
          cleared: true,
          timestamp: new Date().toISOString()
        },
        'All caches cleared successfully'
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return success(
        {
          cleared: false,
          error: errorMessage,
          timestamp: new Date().toISOString()
        },
        'Failed to clear all caches'
      );
    }
  }
}
