import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface CountryMeta {
  code: string;
  nameKo: string;
  nameEn: string;
  currencies: string[];
}

export interface ExchangeRateMeta {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  date: string;
  baseAmount: number;
  quoteAmount: number;
}

interface RestCountry {
  cca2: string;
  name?: { common?: string };
  translations?: Record<string, { official?: string; common?: string }>;
  currencies?: Record<string, { name?: string }>;
}

interface CachedRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  date: string;
}

@Injectable()
export class MetaService {
  private countriesCache: { data: CountryMeta[]; expiresAt: number } | null = null;
  private readonly cacheTTL = 1000 * 60 * 60; // 1시간
  private readonly rateCache = new Map<string, { data: CachedRate; expiresAt: number }>();
  private readonly rateCacheTTL = 1000 * 60 * 10; // 10분

  private mapCountries(payload: RestCountry[]): CountryMeta[] {
    return payload
      .filter((country) => Boolean(country.cca2))
      .map((country) => {
        const nameKo = country.translations?.kor?.common ?? country.name?.common ?? country.cca2;
        const nameEn = country.name?.common ?? country.cca2;
        const currencies = Object.keys(country.currencies ?? {});
        return {
          code: country.cca2,
          nameKo,
          nameEn,
          currencies,
        };
      })
      .sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko'));
  }

  async getCountries(): Promise<CountryMeta[]> {
    if (this.countriesCache && this.countriesCache.expiresAt > Date.now()) {
      return this.countriesCache.data;
    }

    const response = await fetch(
      'https://restcountries.com/v3.1/all?fields=cca2,name,translations,currencies',
    );

    if (!response.ok) {
      throw new ServiceUnavailableException('국가 정보를 가져오지 못했습니다.');
    }

    const payload = (await response.json()) as RestCountry[];
    const mapped = this.mapCountries(payload);
    this.countriesCache = {
      data: mapped,
      expiresAt: Date.now() + this.cacheTTL,
    };
    return mapped;
  }

  async getExchangeRate(
    baseCurrency: string,
    quoteCurrency: string,
    baseAmount = 1000,
  ): Promise<ExchangeRateMeta> {
    const normalizedBase = baseCurrency.toUpperCase();
    const normalizedQuote = quoteCurrency.toUpperCase();
    const normalizedAmount = baseAmount > 0 ? baseAmount : 1;
    const cacheKey = `${normalizedBase}-${normalizedQuote}`;
    const cached = this.rateCache.get(cacheKey);
    const computeResult = (rateData: CachedRate): ExchangeRateMeta => ({
      ...rateData,
      baseAmount: normalizedAmount,
      quoteAmount: rateData.rate * normalizedAmount,
    });

    if (cached && cached.expiresAt > Date.now()) {
      return computeResult(cached.data);
    }

    if (normalizedBase === normalizedQuote) {
      const same = {
        baseCurrency: normalizedBase,
        quoteCurrency: normalizedQuote,
        rate: 1,
        date: new Date().toISOString().slice(0, 10),
      };
      this.rateCache.set(cacheKey, { data: same, expiresAt: Date.now() + this.rateCacheTTL });
      return computeResult(same);
    }

    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${normalizedBase}&to=${normalizedQuote}`,
    );
    if (!response.ok) {
      throw new ServiceUnavailableException('환율 정보를 가져오지 못했습니다.');
    }
    const payload = (await response.json()) as { date: string; rates: Record<string, number> };
    const rateValue = payload.rates?.[normalizedQuote];
    if (typeof rateValue !== 'number') {
      throw new ServiceUnavailableException('요청한 통화쌍 환율이 없습니다.');
    }
    const baseResult: CachedRate = {
      baseCurrency: normalizedBase,
      quoteCurrency: normalizedQuote,
      rate: rateValue,
      date: payload.date,
    };
    this.rateCache.set(cacheKey, { data: baseResult, expiresAt: Date.now() + this.rateCacheTTL });
    return computeResult(baseResult);
  }
}
