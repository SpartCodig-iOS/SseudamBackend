import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './services/notification.service';
import { AuthGuard } from '../../common/guards/auth.guard';

export class RegisterDeviceTokenDto {
  deviceToken!: string;
  deviceType?: string;
  platform?: string;
  appVersion?: string;
}

export class SendNotificationDto {
  title!: string;
  body!: string;
  data?: Record<string, any>;
  userIds?: number[];
  deviceTokens?: string[];
}

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  @Post('device-tokens')
  @ApiOperation({ summary: 'Register device token' })
  @ApiResponse({ status: 201, description: 'Device token registered successfully.' })
  async registerDeviceToken(@Body() dto: RegisterDeviceTokenDto) {
    // TODO: Implement device token registration
    return { success: true, message: 'Device token registered' };
  }

  @Post('send')
  @ApiOperation({ summary: 'Send push notification' })
  @ApiResponse({ status: 200, description: 'Notification sent successfully.' })
  async sendNotification(@Body() dto: SendNotificationDto) {
    // TODO: Implement notification sending
    return { success: true, message: 'Notification sent' };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get notification history' })
  @ApiResponse({ status: 200, description: 'Notification history retrieved successfully.' })
  async getNotificationHistory() {
    // TODO: Implement notification history
    return { success: true, data: [] };
  }
}