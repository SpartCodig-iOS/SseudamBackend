import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsNumber, IsDecimal } from 'class-validator';

export class CreateTravelDto {
  @ApiProperty({ example: 'Japan Trip 2024' })
  @IsString()
  title!: string;

  @ApiProperty({ required: false, example: 'Amazing trip to Tokyo' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2024-12-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2024-12-10' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ example: 'KRW' })
  @IsString()
  baseCurrency!: string;

  @ApiProperty({ required: false, example: 1.0 })
  @IsOptional()
  @IsNumber()
  baseExchangeRate?: number;

  @ApiProperty({ required: false, example: 'JP' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiProperty({ required: false, example: 'JPY' })
  @IsOptional()
  @IsString()
  destinationCurrency?: string;

  @ApiProperty({ required: false, example: 1000000 })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiProperty({ required: false, example: 'KRW' })
  @IsOptional()
  @IsString()
  budgetCurrency?: string;

  @ApiProperty({ required: false, example: '대한민국' })
  @IsOptional()
  @IsString()
  countryNameKr?: string;

  @ApiProperty({ required: false, example: ['KRW', 'USD'] })
  @IsOptional()
  countryCurrencies?: string[];
}

export class UpdateTravelDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  baseExchangeRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  destinationCurrency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  budgetCurrency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  countryNameKr?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  countryCurrencies?: string[];
}

export class InviteMemberDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email!: string;

  @ApiProperty({ required: false, example: 'member' })
  @IsOptional()
  @IsString()
  role?: string;
}