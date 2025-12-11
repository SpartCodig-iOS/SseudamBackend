import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Req,
  UnauthorizedException,
  BadRequestException,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Express } from 'express';
import 'multer';
import { AuthGuard } from '../../common/guards/auth.guard';
import { success } from '../../types/api';
import { RequestWithUser } from '../../types/request';
import { toProfileResponse } from '../../utils/mappers';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { updateProfileSchema } from '../../validators/profileSchemas';
import { ProfileService } from './profile.service';
import { FileInterceptor } from '@nestjs/platform-express';

const formatDate = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

@ApiTags('Profile')
@Controller('api/v1/profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
  ) {}


  @UseGuards(AuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 사용자 프로필 조회 (하이브리드 최적화)' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async getProfile(@Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 🚀 HYBRID-FAST: 캐시/DB 프로필만 동기 조회, 느린 스토리지는 비동기 워밍
    const profile = await this.profileService.getProfileQuick(req.currentUser.id, req.currentUser);
    let resolvedAvatar = profile.avatar_url ?? req.currentUser.avatar_url ?? null;
    if (!resolvedAvatar) {
      // 아바타가 없을 때 스토리지 동기 조회 시도 (타임아웃 완화)
      resolvedAvatar = await this.profileService.fetchAvatarWithTimeout(profile.id, 900);
      if (!resolvedAvatar) {
        // 실패 시 응답은 그대로, 백그라운드 워밍
        void this.profileService.warmAvatarFromStorage(profile.id);
      }
    }

    return success({
      id: profile.id,
      userId: profile.username || profile.email?.split('@')[0] || req.currentUser.username || 'user',
      email: profile.email || '',
      name: profile.name,
      avatarURL: resolvedAvatar, // 즉시 반환, 스토리지는 백그라운드로
      role: profile.role || req.currentUser.role || 'user',
      createdAt: formatDate(profile.created_at),
      updatedAt: formatDate(profile.updated_at),
      loginType: req.loginType ?? 'email'
    });
  }

  @UseGuards(AuthGuard)
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 사용자 프로필 수정' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiBody({
    schema: {
      type: 'object',
      required: [],
      properties: {
        name: { type: 'string', example: '김코드', nullable: true, description: '선택 입력' },
        avatar: {
          type: 'string',
          format: 'binary',
          description: '업로드할 이미지 파일 (선택)',
        },
      },
    },
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  async updateProfile(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = updateProfileSchema.parse(body);
    const updated = await this.profileService.updateProfile(req.currentUser.id, payload, file);
    return success(toProfileResponse(updated), 'Profile updated');
  }

}
