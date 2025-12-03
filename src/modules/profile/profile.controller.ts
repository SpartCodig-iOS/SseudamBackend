import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { success } from '../../types/api';
import { RequestWithUser } from '../../types/request';
import { toProfileResponse } from '../../utils/mappers';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { updateProfileSchema } from '../../validators/profileSchemas';
import { ProfileService } from './profile.service';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Profile')
@Controller('api/v1/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}


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

    // 🚀 HYBRID-FAST: JWT 기본 정보 + 실시간 avatar URL 조회
    const [avatarURL] = await Promise.all([
      this.profileService.getAvatarUrlOnly(req.currentUser.id)
    ]);

    return success({
      id: req.currentUser.id,
      userId: req.currentUser.username || req.currentUser.email?.split('@')[0] || 'user',
      email: req.currentUser.email || '',
      name: req.currentUser.name,
      avatarURL: avatarURL || req.currentUser.avatar_url, // 실시간 또는 JWT fallback
      role: req.currentUser.role || 'user',
      createdAt: req.currentUser.created_at,
      updatedAt: req.currentUser.updated_at,
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
