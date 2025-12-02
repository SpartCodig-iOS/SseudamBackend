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
  @ApiOperation({ summary: '현재 사용자 프로필 조회' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async getProfile(@Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    const dbProfile = await this.profileService.getProfile(req.currentUser.id);
    const baseProfile = dbProfile ?? req.currentUser;

    let profileData = {
      ...toProfileResponse(baseProfile),
      loginType: req.loginType ?? 'email',
    };

    // avatar가 없으면 스토리지에서 최신 이미지를 찾아본다
    if (!profileData.avatarURL) {
      const fallbackAvatar = await this.profileService.resolveAvatarFromStorage(baseProfile.id);
      if (fallbackAvatar) {
        profileData = { ...profileData, avatarURL: fallbackAvatar };
      }
    }

    return success(profileData);
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
