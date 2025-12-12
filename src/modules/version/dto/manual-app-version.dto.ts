import { ApiProperty } from '@nestjs/swagger';

export class ManualAppVersionDto {
  @ApiProperty({ example: '1.0.3' })
  latestVersion!: string;

  @ApiProperty({ example: '[v 1.0.3]\\n- 버그 수정', required: false })
  releaseNotes?: string | null;
}
