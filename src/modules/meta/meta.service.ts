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
  private readonly cacheTTL = 1000 * 60 * 60 * 24; // 24시간 (국가 데이터는 자주 안바뀜)
  private readonly rateCache = new Map<string, { data: CachedRate; expiresAt: number }>();
  private readonly rateCacheTTL = 1000 * 60 * 10; // 10분
  private countriesFetchPromise: Promise<CountryMeta[]> | null = null;
  private readonly ratePromiseCache = new Map<string, Promise<CachedRate>>();
  private readonly networkTimeout = 5000; // 5초로 더 단축 (빠른 폴백)
  private readonly maxCacheSize = 1000; // 최대 캐시 크기

  // 앱 시작 시 워밍을 위한 플래그
  private isWarming = false;
  private fallbackWarned = false;

  // 앱 시작 시 캐시 워밍
  async warmupCache(): Promise<void> {
    if (this.isWarming) return;
    this.isWarming = true;

    try {
      // 국가 데이터 미리 로딩 (백그라운드, 실패해도 괜찮음)
      this.getCountries().catch(() => {
        // 워밍업 실패는 조용히 처리
      });

      // 주요 환율 미리 로딩 (백그라운드)
      const warmupMatrix: Record<string, string[]> = {
        KRW: ['USD', 'JPY', 'EUR'],
        USD: ['KRW', 'JPY', 'EUR'],
        EUR: ['USD', 'KRW', 'JPY'],
      };

      await Promise.allSettled(
        Object.entries(warmupMatrix).map(async ([base, quotes]) => {
          try {
            await this.getMultipleExchangeRates(base, quotes);
          } catch (err) {
            // 워밍업 실패는 조용히 처리 (백그라운드 작업)
            // fallback으로 동작하므로 사용자에게는 영향 없음
          }
        }),
      );

      console.log('[MetaService] Cache warmup initiated');
    } finally {
      this.isWarming = false;
    }
  }

  private async fetchWithTimeout(url: string, retries = 1): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.networkTimeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SseudamBackend/1.0.0',
            'Accept': 'application/json',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        if (attempt === retries) {
          // 재시도 횟수를 줄이고 빠르게 fallback으로 전환
          throw new ServiceUnavailableException(
            `External API timeout - using fallback data`
          );
        }
        // 재시도 대기 시간 단축
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new ServiceUnavailableException('최대 재시도 횟수 초과');
  }

  private cleanupRateCache(): void {
    if (this.rateCache.size <= this.maxCacheSize) return;

    // 만료된 캐시 먼저 제거
    const now = Date.now();
    for (const [key, cache] of this.rateCache.entries()) {
      if (cache.expiresAt <= now) {
        this.rateCache.delete(key);
      }
    }

    // 여전히 크기가 초과하면 오래된 항목 제거
    if (this.rateCache.size > this.maxCacheSize) {
      const entries = Array.from(this.rateCache.entries());
      const toDelete = entries.slice(0, entries.length - this.maxCacheSize);
      toDelete.forEach(([key]) => this.rateCache.delete(key));
    }
  }

  private mapCountries(payload: RestCountry[]): CountryMeta[] {
    // 성능 최적화: 필터링과 매핑을 한 번에
    const mapped: CountryMeta[] = [];

    for (const country of payload) {
      if (!country.cca2) continue; // 빠른 필터링

      // 최소한의 데이터만 추출
      const nameKo = country.translations?.kor?.common ?? country.name?.common ?? country.cca2;
      const nameEn = country.name?.common ?? country.cca2;
      const currencies = country.currencies ? Object.keys(country.currencies) : [];

      // 주요 국가만 우선 처리 (성능 개선)
      mapped.push({
        code: country.cca2,
        nameKo,
        nameEn,
        currencies: currencies.slice(0, 2), // 최대 2개 통화만
      });
    }

    // 한국어 이름으로 정렬 (더 빠른 정렬)
    return mapped.sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko'));
  }

  async getCountries(): Promise<CountryMeta[]> {
    if (this.countriesCache && this.countriesCache.expiresAt > Date.now()) {
      return this.countriesCache.data;
    }
    if (this.countriesFetchPromise) {
      return this.countriesFetchPromise;
    }
    this.countriesFetchPromise = (async () => {
      const response = await this.fetchWithTimeout(
        'https://restcountries.com/v3.1/all?fields=cca2,name,translations,currencies',
      );

      const payload = (await response.json()) as RestCountry[];
      const mapped = this.mapCountries(payload);
      this.countriesCache = {
        data: mapped,
        expiresAt: Date.now() + this.cacheTTL,
      };
      return mapped;
    })();

    try {
      return await this.countriesFetchPromise;
    } finally {
      this.countriesFetchPromise = null;
    }
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

    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return computeResult(cached.data);
      }
      // Use stale data immediately but refresh in the background.
      this.getOrCreateRatePromise(cacheKey, normalizedBase, normalizedQuote).catch(() => {});
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

    const rate = await this.getOrCreateRatePromise(cacheKey, normalizedBase, normalizedQuote);
    return computeResult(rate);
  }

  // 여러 환율을 병렬로 조회 (성능 최적화)
  async getMultipleExchangeRates(
    baseCurrency: string,
    quoteCurrencies: string[],
    baseAmount = 1000,
  ): Promise<ExchangeRateMeta[]> {
    if (quoteCurrencies.length === 0) return [];

    // 병렬로 모든 환율 조회
    const promises = quoteCurrencies.map(quote =>
      this.getExchangeRate(baseCurrency, quote, baseAmount)
    );

    try {
      return await Promise.all(promises);
    } catch (error) {
      // 일부 실패 시에도 성공한 것들은 반환
      const results = await Promise.allSettled(promises);
      const successResults = results
        .filter((result): result is PromiseFulfilledResult<ExchangeRateMeta> =>
          result.status === 'fulfilled'
        )
        .map(result => result.value);

      if (successResults.length === 0) {
        throw error; // 모든 요청이 실패한 경우만 에러 발생
      }

      return successResults;
    }
  }

  private getOrCreateRatePromise(cacheKey: string, base: string, quote: string): Promise<CachedRate> {
    const existing = this.ratePromiseCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const promise = this.fetchAndCacheRate(cacheKey, base, quote)
      .finally(() => {
        this.ratePromiseCache.delete(cacheKey);
      });

    this.ratePromiseCache.set(cacheKey, promise);
    return promise;
  }

  private async fetchAndCacheRate(cacheKey: string, base: string, quote: string): Promise<CachedRate> {
    const rate = await this.requestExchangeRate(base, quote);
    this.rateCache.set(cacheKey, {
      data: rate,
      expiresAt: Date.now() + this.rateCacheTTL,
    });
    this.cleanupRateCache();
    return rate;
  }

  private async requestExchangeRate(base: string, quote: string): Promise<CachedRate> {
    try {
      const params = new URLSearchParams({ from: base, to: quote });
      const response = await this.fetchWithTimeout(`https://api.frankfurter.app/latest?${params.toString()}`);

      const payload = (await response.json()) as { date: string; rates: Record<string, number> };
      const rateValue = payload.rates?.[quote];
      if (typeof rateValue !== 'number') {
        throw new ServiceUnavailableException('요청한 통화쌍 환율이 없습니다.');
      }
      return {
        baseCurrency: base,
        quoteCurrency: quote,
        rate: rateValue,
        date: payload.date,
      };
    } catch (error) {
      if (!this.fallbackWarned) {
        console.info('[MetaService] Using cached exchange rates (external API temporarily unavailable)');
        this.fallbackWarned = true;
      }
      const fallbackRates: Record<string, Record<string, number>> = {
        KRW: { USD: 0.00075, JPY: 0.107, EUR: 0.00069, CNY: 0.0052 },
        USD: { KRW: 1340, JPY: 143, EUR: 0.91, CNY: 7.1 },
        JPY: { KRW: 9.35, USD: 0.007, EUR: 0.0064, CNY: 0.05 },
        EUR: { USD: 1.1, KRW: 1470, JPY: 157, CNY: 7.8 },
        CNY: { USD: 0.141, KRW: 192, JPY: 20.1, EUR: 0.128 },
      };
      const fallbackRate = fallbackRates[base]?.[quote];
      if (!fallbackRate) {
        throw error;
      }
      return {
        baseCurrency: base,
        quoteCurrency: quote,
        rate: fallbackRate,
        date: new Date().toISOString().slice(0, 10),
      };
    }
  }
}
