import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { MetaService } from './meta.service';
import { CountryMetaDto } from './dto/country-meta.dto';
import { ExchangeRateDto } from './dto/exchange-rate.dto';

@ApiTags('Meta')
@Controller('api/v1/meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('countries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '국가/통화 메타 데이터 조회' })
  @ApiOkResponse({ type: CountryMetaDto, isArray: true })
  async getCountries() {
    const countries = await this.metaService.getCountries();
    return success(countries);
  }

  @Get('exchange-rate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '통화 환율 조회 (Frankfurter API)' })
  @ApiOkResponse({ type: ExchangeRateDto })
  async getExchangeRate(
    @Query('base') baseCurrency?: string,
    @Query('quote') quoteCurrency?: string,
  ) {
    if (!baseCurrency || baseCurrency.length !== 3) {
      throw new BadRequestException('base 파라미터는 3자리 통화 코드여야 합니다.');
    }
    if (!quoteCurrency || quoteCurrency.length !== 3) {
      throw new BadRequestException('quote 파라미터는 3자리 통화 코드여야 합니다.');
    }
    const rate = await this.metaService.getExchangeRate(baseCurrency, quoteCurrency, 1000);
    return success(rate);
  }
}
