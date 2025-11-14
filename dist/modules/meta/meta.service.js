"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaService = void 0;
const common_1 = require("@nestjs/common");
let MetaService = class MetaService {
    constructor() {
        this.countriesCache = null;
        this.cacheTTL = 1000 * 60 * 60 * 24; // 24시간 (국가 데이터는 자주 안바뀜)
        this.rateCache = new Map();
        this.rateCacheTTL = 1000 * 60 * 10; // 10분
        this.countriesFetchPromise = null;
        this.ratePromiseCache = new Map();
        this.networkTimeout = 5000; // 5초로 더 단축 (빠른 폴백)
        this.maxCacheSize = 1000; // 최대 캐시 크기
        // 앱 시작 시 워밍을 위한 플래그
        this.isWarming = false;
        this.fallbackWarned = false;
    }
    // 앱 시작 시 캐시 워밍
    async warmupCache() {
        if (this.isWarming)
            return;
        this.isWarming = true;
        try {
            // 국가 데이터 미리 로딩 (백그라운드, 실패해도 괜찮음)
            this.getCountries().catch(() => {
                // 워밍업 실패는 조용히 처리
            });
            // 주요 환율 미리 로딩 (백그라운드)
            const warmupMatrix = {
                KRW: ['USD', 'JPY', 'EUR'],
                USD: ['KRW', 'JPY', 'EUR'],
                EUR: ['USD', 'KRW', 'JPY'],
            };
            await Promise.allSettled(Object.entries(warmupMatrix).map(async ([base, quotes]) => {
                try {
                    await this.getMultipleExchangeRates(base, quotes);
                }
                catch (err) {
                    // 워밍업 실패는 조용히 처리 (백그라운드 작업)
                    // fallback으로 동작하므로 사용자에게는 영향 없음
                }
            }));
            console.log('[MetaService] Cache warmup initiated');
        }
        finally {
            this.isWarming = false;
        }
    }
    async fetchWithTimeout(url, retries = 1) {
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
            }
            catch (error) {
                if (attempt === retries) {
                    // 재시도 횟수를 줄이고 빠르게 fallback으로 전환
                    throw new common_1.ServiceUnavailableException(`External API timeout - using fallback data`);
                }
                // 재시도 대기 시간 단축
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        throw new common_1.ServiceUnavailableException('최대 재시도 횟수 초과');
    }
    cleanupRateCache() {
        if (this.rateCache.size <= this.maxCacheSize)
            return;
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
    mapCountries(payload) {
        // 성능 최적화: 필터링과 매핑을 한 번에
        const mapped = [];
        for (const country of payload) {
            if (!country.cca2)
                continue; // 빠른 필터링
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
    async getCountries() {
        if (this.countriesCache && this.countriesCache.expiresAt > Date.now()) {
            return this.countriesCache.data;
        }
        if (this.countriesFetchPromise) {
            return this.countriesFetchPromise;
        }
        this.countriesFetchPromise = (async () => {
            const response = await this.fetchWithTimeout('https://restcountries.com/v3.1/all?fields=cca2,name,translations,currencies');
            const payload = (await response.json());
            const mapped = this.mapCountries(payload);
            this.countriesCache = {
                data: mapped,
                expiresAt: Date.now() + this.cacheTTL,
            };
            return mapped;
        })();
        try {
            return await this.countriesFetchPromise;
        }
        finally {
            this.countriesFetchPromise = null;
        }
    }
    async getExchangeRate(baseCurrency, quoteCurrency, baseAmount = 1000) {
        const normalizedBase = baseCurrency.toUpperCase();
        const normalizedQuote = quoteCurrency.toUpperCase();
        const normalizedAmount = baseAmount > 0 ? baseAmount : 1;
        const cacheKey = `${normalizedBase}-${normalizedQuote}`;
        const cached = this.rateCache.get(cacheKey);
        const computeResult = (rateData) => ({
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
        const existingPromise = this.ratePromiseCache.get(cacheKey);
        if (existingPromise) {
            const rate = await existingPromise;
            return computeResult(rate);
        }
        const ratePromise = (async () => {
            // Frankfurt API 사용
            try {
                const params = new URLSearchParams({
                    from: normalizedBase,
                    to: normalizedQuote,
                });
                const response = await this.fetchWithTimeout(`https://api.frankfurter.app/latest?${params.toString()}`);
                const payload = (await response.json());
                const rateValue = payload.rates?.[normalizedQuote];
                if (typeof rateValue !== 'number') {
                    throw new common_1.ServiceUnavailableException('요청한 통화쌍 환율이 없습니다.');
                }
                return {
                    baseCurrency: normalizedBase,
                    quoteCurrency: normalizedQuote,
                    rate: rateValue,
                    date: payload.date,
                };
            }
            catch (frankfurterError) {
                // 첫 번째 실패시에만 로그 출력 (스팸 방지)
                if (!this.fallbackWarned) {
                    console.info('[MetaService] Using cached exchange rates (external API temporarily unavailable)');
                    this.fallbackWarned = true;
                }
                // 대체 환율 데이터 (2025년 11월 기준 근사치)
                const fallbackRates = {
                    'KRW': { 'USD': 0.00075, 'JPY': 0.107, 'EUR': 0.00069, 'CNY': 0.0052 },
                    'USD': { 'KRW': 1340, 'JPY': 143, 'EUR': 0.91, 'CNY': 7.1 },
                    'JPY': { 'KRW': 9.35, 'USD': 0.007, 'EUR': 0.0064, 'CNY': 0.05 },
                    'EUR': { 'USD': 1.10, 'KRW': 1470, 'JPY': 157, 'CNY': 7.8 },
                    'CNY': { 'USD': 0.141, 'KRW': 192, 'JPY': 20.1, 'EUR': 0.128 }
                };
                const rate = fallbackRates[normalizedBase]?.[normalizedQuote];
                if (!rate) {
                    throw new common_1.ServiceUnavailableException('환율 정보를 가져오지 못했습니다.');
                }
                return {
                    baseCurrency: normalizedBase,
                    quoteCurrency: normalizedQuote,
                    rate,
                    date: new Date().toISOString().slice(0, 10),
                };
            }
        })();
        this.ratePromiseCache.set(cacheKey, ratePromise);
        try {
            const baseResult = await ratePromise;
            this.rateCache.set(cacheKey, { data: baseResult, expiresAt: Date.now() + this.rateCacheTTL });
            // 캐시 정리
            this.cleanupRateCache();
            return computeResult(baseResult);
        }
        finally {
            this.ratePromiseCache.delete(cacheKey);
        }
    }
    // 여러 환율을 병렬로 조회 (성능 최적화)
    async getMultipleExchangeRates(baseCurrency, quoteCurrencies, baseAmount = 1000) {
        if (quoteCurrencies.length === 0)
            return [];
        // 병렬로 모든 환율 조회
        const promises = quoteCurrencies.map(quote => this.getExchangeRate(baseCurrency, quote, baseAmount));
        try {
            return await Promise.all(promises);
        }
        catch (error) {
            // 일부 실패 시에도 성공한 것들은 반환
            const results = await Promise.allSettled(promises);
            const successResults = results
                .filter((result) => result.status === 'fulfilled')
                .map(result => result.value);
            if (successResults.length === 0) {
                throw error; // 모든 요청이 실패한 경우만 에러 발생
            }
            return successResults;
        }
    }
};
exports.MetaService = MetaService;
exports.MetaService = MetaService = __decorate([
    (0, common_1.Injectable)()
], MetaService);
