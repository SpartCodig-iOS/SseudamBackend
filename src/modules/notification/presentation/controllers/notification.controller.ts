import { Controller, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { AuthGuard } from '../../common/guards/auth.guard';

export class RegisterDeviceTokenDto {
  token!: string;
  platform!: 'ios' | 'android';
  deviceId?: string;
  appVersion?: string;
}

export class SendNotificationDto {
  title!: string;
  body!: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  userIds?: string[];
  topic?: string;
}

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('device-token')
  @ApiOperation({ summary: '디바이스 토큰 등록' })
  @ApiResponse({ status: 200, description: '디바이스 토큰이 성공적으로 등록됨' })
  async registerDeviceToken(
    @Request() req: any,
    @Body() dto: RegisterDeviceTokenDto
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;

    await this.notificationService.registerDeviceToken(userId, dto.token, {
      platform: dto.platform,
      deviceId: dto.deviceId,
      appVersion: dto.appVersion,
    });

    return { success: true };
  }

  @Delete('device-token/:token')
  @ApiOperation({ summary: '디바이스 토큰 제거' })
  @ApiResponse({ status: 200, description: '디바이스 토큰이 성공적으로 제거됨' })
  async removeDeviceToken(
    @Request() req: any,
    @Param('token') token: string
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;

    await this.notificationService.removeDeviceToken(userId, token);

    return { success: true };
  }

  @Delete('device-tokens')
  @ApiOperation({ summary: '사용자의 모든 디바이스 토큰 제거' })
  @ApiResponse({ status: 200, description: '모든 디바이스 토큰이 성공적으로 제거됨' })
  async removeAllDeviceTokens(
    @Request() req: any
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;

    await this.notificationService.removeAllUserTokens(userId);

    return { success: true };
  }

  @Post('send')
  @ApiOperation({ summary: '알림 발송' })
  @ApiResponse({ status: 200, description: '알림이 성공적으로 발송됨' })
  async sendNotification(
    @Body() dto: SendNotificationDto
  ): Promise<{ success: number; failed: number }> {
    const notification = {
      title: dto.title,
      body: dto.body,
      data: dto.data,
      badge: dto.badge,
      sound: dto.sound,
    };

    if (dto.topic) {
      const success = await this.notificationService.sendToTopic(dto.topic, notification);
      return { success: success ? 1 : 0, failed: success ? 0 : 1 };
    }

    if (dto.userIds && dto.userIds.length > 0) {
      return this.notificationService.sendToUsers(dto.userIds, notification);
    }

    throw new Error('Either topic or userIds must be provided');
  }
}