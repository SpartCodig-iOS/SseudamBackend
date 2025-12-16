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
  @ApiOperation({ summary: '🚀 ULTRA FAST: 현재 사용자 프로필 조회 (이미지 최적화)' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async getProfile(@Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 🚀 ULTRA FAST: 프로필과 이미지를 병렬로 빠르게 조회
    const [profile, thumbnailUrl] = await Promise.allSettled([
      this.profileService.getProfileQuick(req.currentUser.id, req.currentUser),
      this.profileService.getAvatarThumbnail(req.currentUser.id) // 썸네일 우선 로딩
    ]);

    const userProfile = profile.status === 'fulfilled' ? profile.value : req.currentUser;

    // 최적화된 아바타 URL 결정 (썸네일 → 기존 URL → 스토리지 조회)
    let resolvedAvatar: string | null = null;

    if (thumbnailUrl.status === 'fulfilled' && thumbnailUrl.value) {
      // 1순위: 썸네일 (가장 빠름)
      resolvedAvatar = thumbnailUrl.value;
    } else if (userProfile.avatar_url) {
      // 2순위: 기존 아바타 URL
      resolvedAvatar = userProfile.avatar_url;
    } else {
      // 3순위: 빠른 스토리지 조회 (300ms 타임아웃으로 단축)
      try {
        resolvedAvatar = await this.profileService.fetchAvatarWithTimeout(userProfile.id, 300);
      } catch {
        // 실패시 백그라운드 워밍만 수행
        void this.profileService.warmAvatarFromStorage(userProfile.id);
      }
    }

    return success({
      id: userProfile.id,
      userId: userProfile.username || userProfile.email?.split('@')[0] || req.currentUser.username || 'user',
      email: userProfile.email || '',
      name: userProfile.name,
      avatarURL: resolvedAvatar, // 🚀 최적화된 이미지 URL (썸네일 우선)
      role: userProfile.role || req.currentUser.role || 'user',
      createdAt: formatDate(userProfile.created_at),
      updatedAt: formatDate(userProfile.updated_at),
      loginType: req.loginType ?? 'email'
    });
  }

  @UseGuards(AuthGuard)
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 사용자 프로필 수정 (이미지 자동 최적화)' })
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
          description: '업로드할 이미지 파일 (자동 압축 및 리사이징)',
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
