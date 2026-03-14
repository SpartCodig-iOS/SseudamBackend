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
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Express } from 'express';
import 'multer';
import { AuthGuard } from '../../common/guards/auth.guard';
import { UserRecord } from '../user/domain/types/user.types';
import { success } from '../../types/api.types';
import { updateProfileSchema } from './validators/profile.validators';
import { RequestWithUser } from '../../types/request.types';
import { toProfileResponse } from '../../shared/infrastructure/utils/mappers';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { ProfileService } from './services';
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
  @ApiOperation({ summary: '🚀 FAST: 현재 사용자 프로필 조회 (캐시 최적화)' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async getProfile(@Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 🚀 FAST: 프로필 빠른 조회 (캐시 우선)
    const userRecord: UserRecord = {
      id: req.currentUser.id,
      email: req.currentUser.email,
      name: req.currentUser.name ?? undefined,
      avatar_url: (req.currentUser as any).avatar_url ?? undefined,
      username: (req.currentUser as any).username ?? req.currentUser.email,
      password_hash: (req.currentUser as any).password_hash || '',
      role: req.currentUser.role || 'user',
      created_at: (req.currentUser as any).created_at ?? new Date(),
      updated_at: (req.currentUser as any).updated_at ?? new Date(),
    };
    const profile = await this.profileService.getProfileQuick(req.currentUser.id, userRecord);

    // 🚀 FAST: 캐시 우선, 짧은 타임아웃으로 첫 로딩 지원
    let resolvedAvatar = profile.avatar_url ?? (req.currentUser as any).avatar_url ?? null;

    // 아바타가 없을 때만 빠른 스토리지 조회 (100ms 초단축 타임아웃)
    if (!resolvedAvatar) {
      try {
        resolvedAvatar = await this.profileService.fetchAvatarWithTimeout(profile.id, 100);
      } catch {
        // 실패시 백그라운드 워밍
        void this.profileService.warmAvatarFromStorage(profile.id);
      }
    }

    return success({
      id: profile.id,
      userId: profile.username || profile.email?.split('@')[0] || userRecord.username || 'user',
      email: profile.email || '',
      name: profile.name,
      avatarURL: resolvedAvatar, // 🚀 빠른 아바타 (캐시 우선)
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
