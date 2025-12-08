import { ApiProperty } from '@nestjs/swagger';

export class AppVersionDto {
  @ApiProperty({ example: 'com.example.myapp' })
  bundleId!: string;

  @ApiProperty({ example: '1.2.3' })
  latestVersion!: string;

  @ApiProperty({ example: '버그 수정 및 성능 개선', nullable: true })
  releaseNotes!: string | null;

  @ApiProperty({ example: 'MyApp', nullable: true })
  trackName!: string | null;

  @ApiProperty({ example: '15.0', nullable: true })
  minimumOsVersion!: string | null;

  @ApiProperty({ example: '2025-01-15T00:00:00Z', nullable: true })
  lastUpdated!: string | null;

  @ApiProperty({ example: '1.0.0', nullable: true, description: '서버가 요구하는 최소 지원 버전' })
  minSupportedVersion!: string | null;

  @ApiProperty({ example: false, description: '강제 업데이트 여부' })
  forceUpdate!: boolean;

  @ApiProperty({ example: '1.1.0', nullable: true, description: '클라이언트가 보고한 현재 버전' })
  currentVersion!: string | null;

  @ApiProperty({ example: true, description: '현재 버전이 최신 버전보다 낮은 경우' })
  shouldUpdate!: boolean;

  @ApiProperty({
    example: 'https://apps.apple.com/kr/app/example/id123456789',
    nullable: true,
    description: 'App Store에서 해당 앱으로 이동할 수 있는 URL',
  })
  appStoreUrl!: string | null;

  @ApiProperty({
    example: '최신 버전이 나왔습니다. 앱스토어에서 업데이트 해주세요!',
    nullable: true,
    description: '업데이트 안내 메시지 (업데이트 필요 시에만 제공)',
  })
  message!: string | null;
}
