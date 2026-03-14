import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import { NotificationService } from './services/notification.service';
import { AuthGuard } from '../../common/guards/auth.guard';

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'device-token-123' })
  @IsString()
  deviceToken!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class SendNotificationDto {
  @ApiProperty({ example: 'Notification Title' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'Notification body content' })
  @IsString()
  body!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiProperty({ required: false, type: [Number] })
  @IsOptional()
  @IsArray()
  userIds?: number[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
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