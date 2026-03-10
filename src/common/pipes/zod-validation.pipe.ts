/**
 * ZodValidationPipe
 *
 * Zod 스키마를 NestJS PipeTransform으로 감싼다.
 *
 * 사용법 (컨트롤러):
 *   @Body(new ZodValidationPipe(loginSchema)) body: LoginInput
 *   @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput
 *
 * 기존 컨트롤러에서 직접 schema.parse(body) 를 호출하던 코드를
 * Pipe 한 줄로 교체할 수 있다.
 *
 * 에러 처리:
 *   ZodError → AllExceptionsFilter 에서 이미 400으로 변환하므로
 *   그대로 throw 한다.
 */
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe<T = unknown> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // AllExceptionsFilter 가 ZodError를 400으로 변환함
      throw result.error;
    }
    return result.data;
  }
}

/**
 * 스키마를 미리 바인딩해서 파라미터 데코레이터로 사용 가능한 팩토리
 *
 * 사용 예:
 *   import { zodPipe } from '../../common/pipes/zod-validation.pipe';
 *   @Body(zodPipe(loginSchema)) body: LoginInput
 */
export function zodPipe<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
