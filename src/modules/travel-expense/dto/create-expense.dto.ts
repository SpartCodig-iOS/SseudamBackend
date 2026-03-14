import { IsString, IsNumber, IsOptional, IsArray, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpenseInput {
  @ApiProperty({ description: '지출 제목' })
  @IsString()
  title!: string;

  @ApiProperty({ description: '지출 금액' })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: '통화 코드' })
  @IsString()
  currency!: string;

  @ApiProperty({ description: '지출 날짜' })
  @IsDateString()
  expenseDate!: string;

  @ApiProperty({ description: '결제자 ID' })
  @IsString()
  payerId!: string;

  @ApiProperty({ description: '카테고리', required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ description: '메모', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '참여자 ID 목록' })
  @IsArray()
  @IsString({ each: true })
  participantIds!: string[];
}

export class UpdateExpenseInput extends CreateExpenseInput {
  @ApiProperty({ description: '지출 ID' })
  @IsString()
  id!: string;
}