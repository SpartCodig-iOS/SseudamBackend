import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CreateExpenseInput } from './schemas/travel-expense.schemas';
import { MetaService } from '../meta/meta.service';
import { CacheService } from '../../common/services/cache.service';
import { PushNotificationService } from '../notification/services/push-notification.service';
import { AnalyticsService } from '../../common/services/analytics.service';
import { ProfileService } from '../profile/profile.service';
import { QueueEventService } from '../queue/services/queue-event.service';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';
import { TravelExpenseRepository } from './repositories/travel-expense.repository';
import { TravelExpenseParticipantRepository } from './repositories/travel-expense-participant.repository';
import { TravelExpense as TravelExpenseEntity } from './entities/travel-expense.entity';

interface TravelContext {
  id: string;
  baseCurrency: string;
  baseExchangeRate: number;
  memberIds: string[];
  memberNameMap: Map<string, string | null>;
  memberEmailMap: Map<string, string | null>;
  memberAvatarMap: Map<string, string | null>;
}

export interface TravelExpense {
  id: string;
  title: string;
  note: string | null;
  amount: number;
  currency: string;
  convertedAmount: number;
  expenseDate: string;
  category: string | null;
  authorId: string;
  payerId?: string;
  payerName: string | null;
  payer?: TravelExpenseMember | null;
  participants: TravelExpenseParticipant[];
  expenseMembers?: TravelExpenseMember[];
}

export interface TravelExpenseMember {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface TravelExpenseParticipant {
  memberId: string;
  userId: string; // iOS 클라이언트가 요구하는 필드
  name: string | null;
}

@Injectable()
export class TravelExpenseService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly expenseRepository: TravelExpenseRepository,
    private readonly participantRepository: TravelExpenseParticipantRepository,
    private readonly metaService: MetaService,
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushNotificationService: PushNotificationService,
    private readonly analyticsService: AnalyticsService,
    private readonly profileService: ProfileService,
    private readonly queueEventService: QueueEventService,
    private readonly metricsService: AppMetricsService,
  ) {}

  /**
   * 🚀 경비 멤버 아바타 빠른 로딩 최적화
   */
  private async optimizeExpenseMemberAvatars(
    rawMembers: Array<{ id: string; avatar_url?: string | null }>,
    memberAvatarMap: Map<string, string | null>
  ): Promise<void> {
    try {
      // 아바타가 없는 멤버들만 필터링
      const membersNeedingAvatars = rawMembers.filter(member => !member.avatar_url);

      if (membersNeedingAvatars.length === 0) {
        return;
      }

      // 병렬로 썸네일 아바타 빠른 조회 (50ms 초단축 타임아웃)
      const avatarPromises = membersNeedingAvatars.map(async (member) => {
        try {
          const thumbnailUrl = await this.profileService.fetchAvatarWithTimeout(member.id, 50);
          if (thumbnailUrl) {
            memberAvatarMap.set(member.id, thumbnailUrl);
          } else {
            // 실패시 백그라운드 워밍
            void this.profileService.warmAvatarFromStorage(member.id);
          }
        } catch {
          // 타임아웃이나 오류 시 백그라운드 워밍만 수행
          void this.profileService.warmAvatarFromStorage(member.id);
        }
      });

      // 모든 아바타 조회를 병렬로 처리 (최대 50ms 대기)
      await Promise.allSettled(avatarPromises);

    } catch (error) {
      console.warn('Expense member avatar optimization failed:', error);
      // 실패해도 경비 조회는 정상 진행
    }
  }

  private readonly EXPENSE_LIST_PREFIX = 'expense:list';
  private readonly EXPENSE_DETAIL_PREFIX = 'expense:detail';
  private readonly EXPENSE_LIST_TTL_SECONDS = 120; // 2분
  private readonly EXPENSE_DETAIL_TTL_SECONDS = 120; // 2분
  private readonly CONTEXT_PREFIX = 'expense:context';
  private readonly CONTEXT_TTL_SECONDS = 600; // 10분
  private readonly contextCache = new Map<string, { data: TravelContext; expiresAt: number }>();
  private readonly conversionCache = new Map<string, number>(); // currency->KRW 환율 캐시 (요청 단위)
  private readonly DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  private normalizeExpenseDate(input: string): string {
    if (!input || !this.DATE_PATTERN.test(input)) {
      throw new BadRequestException('expenseDate는 YYYY-MM-DD 형식이어야 합니다.');
    }
    // 간단 검증: 존재하지 않는 날짜 거르기
    const parsed = new Date(`${input}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('유효한 expenseDate가 아닙니다.');
    }
    return input;
  }

  private async getTravelContext(travelId: string, userId: string): Promise<TravelContext> {
    const cached = this.contextCache.get(travelId);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.data.memberIds.includes(userId)) {
        return cached.data;
      }
      // 캐시가 있지만 내 멤버십이 없으면 캐시를 버리고 DB 재조회
      this.contextCache.delete(travelId);
    }
    try {
      const redisCached = await this.cacheService.get<TravelContext>(travelId, { prefix: this.CONTEXT_PREFIX });
      if (redisCached) {
        if (redisCached.memberIds.includes(userId)) {
          this.contextCache.set(travelId, { data: redisCached, expiresAt: Date.now() + this.CONTEXT_TTL_SECONDS * 1000 });
          return redisCached;
        }
        // Redis 캐시에도 없으면 무시하고 DB 재조회
      }
    } catch {
      // ignore and fallback to DB
    }

    // TypeORM으로 travel과 members 조회 - 기존 최적화된 메서드 사용
    const travel = await this.dataSource.getRepository('Travel').findOne({
      where: { id: travelId },
      relations: ['members', 'members.user']
    });

    if (!travel) {
      throw new NotFoundException(`Travel not found: ${travelId}`);
    }

    // Travel context 직접 생성 (불필요한 배열 제거)
    const row = {
      id: travel.id,
      base_currency: travel.baseCurrency,
      base_exchange_rate: travel.baseExchangeRate,
      member_data: travel.members.map((member: any) => ({
        id: member.userId,
        name: member.user?.name || null,
        email: member.user?.email || null,
        avatar_url: member.user?.avatarUrl || null
      }))
    };
    const rawMembers: Array<{ id: string; name?: string | null; email?: string | null; avatar_url?: string | null }> = row.member_data ?? [];
    const memberIds = rawMembers.map((member) => member.id);


    if (!memberIds.includes(userId)) {
      throw new BadRequestException('해당 여행에 접근 권한이 없습니다.');
    }
    const memberNameMap = new Map<string, string | null>();
    const memberEmailMap = new Map<string, string | null>();
    const memberAvatarMap = new Map<string, string | null>();
    rawMembers.forEach((member) => {
      memberNameMap.set(member.id, member.name ?? null);
      memberEmailMap.set(member.id, member.email ?? null);
      memberAvatarMap.set(member.id, member.avatar_url ?? null);
    });

    // 🚀 아바타 빠른 로딩 최적화
    await this.optimizeExpenseMemberAvatars(rawMembers, memberAvatarMap);
    const context: TravelContext = {
      id: row.id,
      baseCurrency: row.base_currency || 'KRW',
      baseExchangeRate: Number(row.base_exchange_rate ?? 0),
      memberIds,
      memberNameMap,
      memberEmailMap,
      memberAvatarMap,
    };

    this.contextCache.set(travelId, { data: context, expiresAt: Date.now() + this.CONTEXT_TTL_SECONDS * 1000 });
    this.cacheService.set(travelId, context, { prefix: this.CONTEXT_PREFIX, ttl: this.CONTEXT_TTL_SECONDS }).catch(() => undefined);
    return context;
  }

  private async convertAmount(
    amount: number,
    currency: string,
    targetCurrency: string,
    fallbackRate?: number,
  ): Promise<number> {
    if (currency === targetCurrency) {
      return amount;
    }
    // 요청 단위 환율 캐시 활용 (currency -> KRW)
    if (targetCurrency === 'KRW' && this.conversionCache.has(currency)) {
      const rate = this.conversionCache.get(currency)!;
      return Number((amount * rate).toFixed(2));
    }

    // baseExchangeRate가 있으면 API 호출 없이 바로 계산
    if (targetCurrency === 'KRW' && fallbackRate && currency !== targetCurrency) {
      return Number((amount * fallbackRate).toFixed(2));
    }
    try {
      const conversion = await this.metaService.getExchangeRate(currency, targetCurrency, amount);
      // KRW 대상이면 rate 캐시 저장 (amount에 따라 선형이라 단일 rate로 충분)
      if (targetCurrency === 'KRW' && amount !== 0) {
        const rate = Number(conversion.quoteAmount) / amount;
        if (Number.isFinite(rate)) {
          this.conversionCache.set(currency, rate);
        }
      }
      return Number(conversion.quoteAmount);
    } catch (error) {
      if (fallbackRate && targetCurrency === 'KRW' && currency !== targetCurrency) {
        return Number((amount * fallbackRate).toFixed(2));
      }
      // 환율 API 실패 시 fallback: 동일 금액 반환 (추가 오류 방지)
      return amount;
    }
  }

  private normalizeParticipants(memberIds: string[], provided?: string[]): string[] {
    if (!provided || provided.length === 0) {
      return memberIds;
    }
    const invalid = provided.filter((id) => !memberIds.includes(id));
    if (invalid.length > 0) {
      throw new BadRequestException('참여자 목록에 여행 멤버가 아닌 사용자가 포함되어 있습니다.');
    }
    return provided;
  }

  private ensurePayer(memberIds: string[], payerId: string): void {
    if (!memberIds.includes(payerId)) {
      throw new BadRequestException('결제자는 여행 멤버여야 합니다.');
    }
  }

  private getMemberProfile(context: TravelContext, memberId: string): TravelExpenseMember | null {
    if (!context.memberIds.includes(memberId)) {
      return null;
    }
    return {
      userId: memberId,
      name: context.memberNameMap.get(memberId) ?? null,
      email: context.memberEmailMap.get(memberId) ?? null,
      avatarUrl: context.memberAvatarMap.get(memberId) ?? null,
    };
  }

  private normalizeMember(member: any): TravelExpenseMember | null {
    const id = member?.userId ?? member?.memberId;
    if (!id) return null;
    return {
      userId: id,
      name: member.name ?? null,
      email: member.email ?? null,
      avatarUrl: member.avatarUrl ?? null,
    };
  }

  private toParticipant(member: TravelExpenseMember | null): TravelExpenseParticipant | null {
    if (!member) return null;
    return {
      memberId: member.userId,
      userId: member.userId, // iOS 클라이언트가 필요로 하는 필드
      name: member.name
    };
  }

  private async invalidateExpenseCaches(travelId: string, expenseId?: string): Promise<void> {
    // 리스트 캐시 삭제
    await this.cacheService.delPattern(`${this.EXPENSE_LIST_PREFIX}:${travelId}:*`).catch(() => undefined);
    if (expenseId) {
      await this.cacheService.del(expenseId, { prefix: this.EXPENSE_DETAIL_PREFIX }).catch(() => undefined);
    }
    // 정산 요약 캐시도 무효화
    await this.cacheService.del(travelId, { prefix: 'settlement:summary' }).catch(() => undefined);
    await this.invalidateContextCache(travelId);
  }

  private async invalidateContextCache(travelId: string): Promise<void> {
    this.contextCache.delete(travelId);
    await this.cacheService.del(travelId, { prefix: this.CONTEXT_PREFIX }).catch(() => undefined);
  }

  // 여행 멤버 변경 시 지출 컨텍스트 캐시를 강제로 무효화하여 나간 사용자에게 푸시가 가지 않도록 함
  @OnEvent('travel.membership_changed', { async: true })
  async handleTravelMembershipChanged(payload: { travelId: string }) {
    if (!payload?.travelId) return;
    await this.invalidateContextCache(payload.travelId);
  }

  private async getCachedExpenseList(cacheKey: string): Promise<TravelExpense[] | null> {
    try {
      return await this.cacheService.get<TravelExpense[]>(cacheKey, {
        prefix: this.EXPENSE_LIST_PREFIX,
      });
    } catch {
      return null;
    }
  }

  private async setCachedExpenseList(cacheKey: string, payload: TravelExpense[]): Promise<void> {
    this.cacheService.set(cacheKey, payload, {
      prefix: this.EXPENSE_LIST_PREFIX,
      ttl: this.EXPENSE_LIST_TTL_SECONDS,
    }).catch(() => undefined);
  }

  private async getCachedExpenseDetail(expenseId: string): Promise<TravelExpense | null> {
    try {
      return await this.cacheService.get<TravelExpense>(expenseId, { prefix: this.EXPENSE_DETAIL_PREFIX });
    } catch {
      return null;
    }
  }

  private async setCachedExpenseDetail(expenseId: string, expense: TravelExpense): Promise<void> {
    this.cacheService.set(expenseId, expense, {
      prefix: this.EXPENSE_DETAIL_PREFIX,
      ttl: this.EXPENSE_DETAIL_TTL_SECONDS,
    }).catch(() => undefined);
  }

  private async invalidateExpenseListAndDetail(travelId: string, expenseId?: string): Promise<void> {
    await this.invalidateExpenseCaches(travelId, expenseId);
  }

  async createExpense(
    travelId: string,
    userId: string,
    payload: CreateExpenseInput,
  ): Promise<TravelExpense> {
    // 요청 단위 환율 캐시 초기화
    this.conversionCache.clear();

    // 컨텍스트 조회와 환율 변환을 병렬로 처리하기 위해 먼저 컨텍스트만 조회
    const context = await this.getTravelContext(travelId, userId);
    const payerId = payload.payerId ?? userId;
    this.ensurePayer(context.memberIds, payerId);
    const expenseDate = this.normalizeExpenseDate(payload.expenseDate);

    const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
    if (participantIds.length === 0) {
      throw new BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
    }

    // 환율 변환은 독립적으로 실행 가능하므로 병렬 처리 대상
    const convertedAmount = await this.convertAmount(
      payload.amount,
      payload.currency,
      'KRW',
      context.baseExchangeRate,
    );

    const result = await this.dataSource.transaction(async (manager) => {
      // TypeORM을 사용하여 지출 생성
      const expenseEntity = new TravelExpenseEntity({
        travelId,
        title: payload.title,
        note: payload.note ?? null,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        convertedAmount,
        expenseDate,
        category: payload.category as any,
        payerId,
        authorId: userId,
      });

      const savedExpense = await manager.save(TravelExpenseEntity, expenseEntity);

      // TypeORM을 사용하여 참여자 추가
      if (participantIds.length > 0) {
        await this.participantRepository.addParticipants(savedExpense.id, participantIds);
      }

      const payerProfile = this.getMemberProfile(context, payerId);
      const expenseMembers = context.memberIds
        .map((memberId) => this.getMemberProfile(context, memberId))
        .filter((member): member is TravelExpenseMember => member !== null);
      const participants = participantIds
        .map((memberId) => this.toParticipant(this.getMemberProfile(context, memberId)))
        .filter(Boolean) as TravelExpenseParticipant[];

      return {
        id: savedExpense.id,
        title: savedExpense.title,
        note: savedExpense.note,
        amount: Number(savedExpense.amount),
        currency: savedExpense.currency,
        convertedAmount: Number(savedExpense.convertedAmount),
        expenseDate: savedExpense.expenseDate,
        category: savedExpense.category,
        authorId: savedExpense.authorId,
        payerName: payerProfile?.name ?? null,
        payer: payerProfile,
        participants,
        expenseMembers,
      };
    });

    // 생성 후 캐시 무효화 (동기)로 즉시 반영
    await this.invalidateExpenseCaches(travelId);

    // 지출 추가 알림 이벤트 발송 (딥링크 포함)
    const currentUserName = this.getMemberProfile(context, userId)?.name || '사용자';
    await this.pushNotificationService.sendExpenseNotification(
      'expense_added',
      travelId,
      result.id, // expenseId for deep link
      userId,
      currentUserName,
      payload.title,
      context.memberIds,
      payload.amount,
      payload.currency
    );

    // Analytics 전송 (비동기)
    this.analyticsService.trackEvent(
      'expense_created',
      {
        travel_id: travelId,
        expense_id: result.id,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        participant_count: participantIds.length,
      },
      { userId },
    ).catch(() => undefined);

    // 🎯 백그라운드 경비 추가 이벤트 발송 (기존 동작에 영향 없음)
    this.queueEventService.emitExpenseAdded({
      travelId,
      expenseId: result.id,
      title: payload.title,
      amount: payload.amount,
      currency: payload.currency,
      convertedAmount,
      payerId: payerId,
      payerName: context.memberNameMap.get(payerId) || '알 수 없는 사용자',
      participantIds: participantIds,
    }).catch(error => {
      // Queue 실패해도 API는 정상 응답
      console.warn(`Failed to emit expense added event: ${error.message}`);
    });

    this.metricsService?.recordExpenseAdded(payload.currency, payload.category ?? null);
    return result;
  }

  async listExpenses(
    travelId: string,
    userId: string,
    pagination: { startDate?: string; endDate?: string } = {},
  ): Promise<TravelExpense[]> {
    const context = await this.getTravelContext(travelId, userId);

    // TypeORM을 사용한 새로운 구현
    return this.listExpensesWithTypeORM(travelId, context, pagination);
  }

  /**
   * TypeORM을 사용한 경비 목록 조회
   */
  private async listExpensesWithTypeORM(
    travelId: string,
    context: TravelContext,
    pagination: { startDate?: string; endDate?: string } = {}
  ): Promise<TravelExpense[]> {
    // 캐시 확인
    const { startDate, endDate } = pagination;
    const cacheKey = `${travelId}:${startDate || ''}:${endDate || ''}`;
    const cached = await this.getCachedExpenseList(cacheKey);

    if (cached) {
      return this.transformCachedExpenses(cached, context);
    }

    // TypeORM으로 데이터 조회
    const expenses = await this.expenseRepository.findExpensesWithParticipants(travelId);

    // 날짜 필터 적용
    const filteredExpenses = this.applyDateFilter(expenses, startDate, endDate);

    // TravelExpense 형식으로 변환
    const transformedExpenses = await this.transformToTravelExpenses(filteredExpenses, context);

    // 캐시에 저장
    await this.setCachedExpenseList(cacheKey, transformedExpenses);

    return transformedExpenses;
  }

  /**
   * TypeORM 엔티티를 TravelExpense 인터페이스로 변환
   */
  private async transformToTravelExpenses(
    expenses: any[], // TypeORM TravelExpense entities
    context: TravelContext
  ): Promise<TravelExpense[]> {
    return Promise.all(expenses.map(async (expense) => {
      // 환율 변환
      const convertedAmount = await this.convertAmount(
        Number(expense.amount),
        expense.currency,
        context.baseCurrency,
        context.baseExchangeRate
      );

      // Payer 정보
      const payerProfile = this.getMemberProfile(context, expense.payerId) ?? {
        userId: expense.payerId,
        name: expense.payer?.name ?? null,
        email: expense.payer?.email ?? null,
        avatarUrl: expense.payer?.avatar_url ?? null,
      };

      // Participants 정보
      const participants = expense.participants?.map((p: any) =>
        this.toParticipant(this.getMemberProfile(context, p.memberId)) ?? {
          memberId: p.memberId,
          userId: p.memberId, // iOS 클라이언트가 필요로 하는 필드 추가
          name: p.member?.name ?? null,
        }
      ) ?? [];

      // ExpenseMembers (전체 여행 멤버)
      const expenseMembers = context.memberIds
        .map((memberId) => this.getMemberProfile(context, memberId))
        .filter((member): member is TravelExpenseMember => member !== null);

      return {
        id: expense.id,
        title: expense.title,
        note: expense.note,
        amount: Number(expense.amount),
        currency: expense.currency,
        convertedAmount,
        expenseDate: expense.expenseDate,
        category: expense.category,
        authorId: expense.authorId,
        payerId: expense.payerId,
        payerName: payerProfile?.name ?? null,
        payer: payerProfile,
        participants,
        expenseMembers,
      };
    }));
  }

  /**
   * 날짜 필터 적용
   */
  private applyDateFilter(expenses: any[], startDate?: string, endDate?: string): any[] {
    if (!startDate && !endDate) return expenses;

    return expenses.filter(expense => {
      const expenseDate = new Date(expense.expenseDate);

      if (startDate && expenseDate < new Date(startDate)) return false;
      if (endDate && expenseDate > new Date(endDate)) return false;

      return true;
    });
  }

  /**
   * 캐시된 데이터를 TravelExpense 형식으로 변환
   */
  private transformCachedExpenses(cached: any[], context: TravelContext): TravelExpense[] {
    const expenseMembers = context.memberIds
      .map((memberId) => this.getMemberProfile(context, memberId))
      .filter((member): member is TravelExpenseMember => member !== null);

    return cached.map((item) => {
      const { payerId: _legacyPayerId, ...rest } = item as any;
      const payerProfile =
        this.normalizeMember(rest.payer) ??
        this.getMemberProfile(context, (_legacyPayerId as string) || rest.payer?.memberId || rest.payer?.userId) ??
        null;

      // expenseMembers는 항상 전체 여행 멤버로 설정 (캐시 손상 방지)
      const finalExpenseMembers: TravelExpenseMember[] = expenseMembers;

      return {
        ...rest,
        payer: payerProfile,
        payerName: rest.payerName ?? payerProfile?.name ?? null,
        expenseMembers: finalExpenseMembers,
        participants: rest.participants?.map((p: any) => this.toParticipant(this.getMemberProfile(context, p.memberId)) ?? p) ?? [],
      };
    });
  }

  /**
   * 기존 Raw SQL 기반 구현 (백업용)
   */
  private async listExpensesLegacy(
    travelId: string,
    userId: string,
    pagination: { startDate?: string; endDate?: string } = {},
  ): Promise<TravelExpense[]> {
    const context = await this.getTravelContext(travelId, userId);

    // 날짜 필터 파라미터 검증 및 준비
    const { startDate, endDate } = pagination;
    let dateFilter = '';
    const queryParams = [travelId];
    let paramIndex = 2;

    if (startDate || endDate) {
      const dateConditions = [];
      if (startDate) {
        const normalized = this.normalizeExpenseDate(startDate);
        dateConditions.push(`e.expense_date::date >= to_date($${paramIndex}, 'YYYY-MM-DD')`);
        queryParams.push(normalized);
        paramIndex++;
      }
      if (endDate) {
        const normalized = this.normalizeExpenseDate(endDate);
        dateConditions.push(`e.expense_date::date <= to_date($${paramIndex}, 'YYYY-MM-DD')`);
        queryParams.push(normalized);
        paramIndex++;
      }
      dateFilter = `AND ${dateConditions.join(' AND ')}`;
    }

    // 캐시 키에 날짜 필터 포함
    const cacheKey = `${travelId}:${startDate || ''}:${endDate || ''}`;

    const cached = await this.getCachedExpenseList(cacheKey);
    if (cached) {
      const expenseMembers = context.memberIds
        .map((memberId) => this.getMemberProfile(context, memberId))
        .filter((member): member is TravelExpenseMember => member !== null);
      return cached.map((item) => {
        const { payerId: _legacyPayerId, ...rest } = item as any;
        const payerProfile =
          this.normalizeMember(rest.payer) ??
          this.getMemberProfile(context, (_legacyPayerId as string) || rest.payer?.memberId || rest.payer?.userId) ??
          null;
        // expenseMembers 배열에서 빈 객체 제거하고 유효한 멤버만 정규화
        const rawExpenseMembers = rest.expenseMembers ?? rest.travelMembers ?? expenseMembers;
        const normalizedExpenseMembers = rawExpenseMembers
          .map((m: any) => {
            // 빈 객체나 유효하지 않은 멤버 필터링
            if (!m || (typeof m === 'object' && Object.keys(m).length === 0)) {
              return null;
            }

            const normalized = this.normalizeMember(m);
            if (normalized) return normalized;

            const memberId = m?.memberId || m?.userId;
            if (memberId) {
              return this.getMemberProfile(context, memberId) ?? {
                userId: memberId,
                name: m?.name ?? null,
                email: m?.email ?? null,
                avatarUrl: m?.avatarUrl ?? null,
              };
            }
            return null;
          })
          .filter((member: TravelExpenseMember | null): member is TravelExpenseMember => member !== null);

        // 만약 정규화된 멤버가 없다면 전체 여행 멤버 사용
        const finalExpenseMembers: TravelExpenseMember[] = normalizedExpenseMembers.length > 0 ? normalizedExpenseMembers : expenseMembers;
        return {
          ...rest,
          payer: payerProfile,
          payerName: rest.payerName ?? payerProfile?.name ?? null,
          expenseMembers: finalExpenseMembers,
          participants: rest.participants?.map((p: any) => this.toParticipant(this.getMemberProfile(context, p.memberId)) ?? p) ?? [],
        };
      });
    }

    // TypeORM으로 expenses와 participants 조회 - 데이터베이스 레벨에서 날짜 필터링
    let expenses: TravelExpenseEntity[];
    if (startDate && endDate) {
      expenses = await this.expenseRepository.findExpensesByDateRange(travelId, startDate, endDate);
    } else {
      expenses = await this.expenseRepository.findExpensesWithParticipants(travelId);
    }

    // 변환 로직을 재사용 가능한 형태로 개선
    const combinedRows = expenses.map(expense => this.transformExpenseToResponse(expense));

    const expenseMembers = context.memberIds
      .map((memberId) => this.getMemberProfile(context, memberId))
      .filter((member): member is TravelExpenseMember => member !== null);

    const items = await Promise.all(combinedRows.map(async (row: any) => {
      const amount = Number(row.amount);
      const convertedAmount = await this.convertAmount(
        amount,
        row.currency,
        'KRW',
        context.baseExchangeRate,
      );
      const payerProfile = this.getMemberProfile(context, row.payer_id) ?? {
        userId: row.payer_id,
        name: row.payer_name ?? null,
        email: row.payer_email ?? null,
        avatarUrl: row.payer_avatar ?? null,
      };
      const participantList = Array.isArray(row.participants) ? row.participants : [];
      const participants = participantList.map((p: any) =>
        this.toParticipant(this.getMemberProfile(context, p.memberId)) ?? {
          memberId: p.memberId,
          userId: p.memberId, // iOS 클라이언트가 필요로 하는 필드 추가
          name: p.name ?? null,
        }
      );

      return {
        id: row.id,
        title: row.title,
        note: row.note,
        amount,
        currency: row.currency,
        convertedAmount,
        expenseDate: row.expense_date,
        category: row.category,
        payerName: payerProfile?.name ?? null,
        payer: payerProfile,
        authorId: row.author_id,
        participants,
        expenseMembers,
      };
    }));

    // 캐시에 저장
    await this.setCachedExpenseList(cacheKey, items);

    return items;
  }

  /**
   * 지출을 수정합니다.
   * 권한: 해당 여행의 멤버라면 모두 수정 가능
   */
  async updateExpense(
    travelId: string,
    expenseId: string,
    userId: string,
    payload: CreateExpenseInput,
  ): Promise<TravelExpense> {
    // 1. 사용자가 여행 멤버인지 확인
    const context = await this.getTravelContext(travelId, userId);

    // 2. 기존 지출 정보 조회 및 권한 확인
    const existingExpense = await this.expenseRepository.findExpenseWithDetails(expenseId);
    if (!existingExpense || existingExpense.travelId !== travelId) {
      throw new NotFoundException('지출을 찾을 수 없습니다.');
    }

    const payerId = payload.payerId ?? userId;
    this.ensurePayer(context.memberIds, payerId);
    const expenseDate = this.normalizeExpenseDate(payload.expenseDate);

    const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
    if (participantIds.length === 0) {
      throw new BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
    }

    // 환율 변환
    const convertedAmount = await this.convertAmount(
      payload.amount,
      payload.currency,
      'KRW',
      context.baseExchangeRate,
    );

    // 4. 트랜잭션으로 지출 수정
    const result = await this.dataSource.transaction(async (manager) => {
      // TypeORM을 사용하여 기존 지출 정보 업데이트
      await manager.update(TravelExpenseEntity, expenseId, {
        title: payload.title,
        note: payload.note ?? null,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        convertedAmount,
        expenseDate,
        category: payload.category as any,
        payerId,
        updatedAt: new Date(),
      });

      // 업데이트된 지출 조회
      const updatedExpense = await manager.findOne(TravelExpenseEntity, { where: { id: expenseId } });
      if (!updatedExpense) {
        throw new NotFoundException('지출 업데이트에 실패했습니다.');
      }

      // TypeORM을 사용하여 참여자 교체
      await this.participantRepository.replaceParticipants(expenseId, participantIds);

      const updatePayerProfile = this.getMemberProfile(context, payerId);
      const updateExpenseMembers = context.memberIds
        .map((memberId) => this.getMemberProfile(context, memberId))
        .filter((member): member is TravelExpenseMember => member !== null);
      const updateParticipants = participantIds
        .map((memberId) => this.toParticipant(this.getMemberProfile(context, memberId)))
        .filter(Boolean) as TravelExpenseParticipant[];

      return {
        id: updatedExpense.id,
        title: updatedExpense.title,
        note: updatedExpense.note,
        amount: Number(updatedExpense.amount),
        currency: updatedExpense.currency,
        convertedAmount: Number(updatedExpense.convertedAmount),
        expenseDate: updatedExpense.expenseDate,
        category: updatedExpense.category,
        authorId: updatedExpense.authorId,
        payerName: updatePayerProfile?.name ?? null,
        payer: updatePayerProfile,
        participants: updateParticipants,
        expenseMembers: updateExpenseMembers,
      };
    });

    // 수정 후 캐시 무효화 (동기로 처리해 즉시 반영)
    await this.invalidateExpenseCaches(travelId, expenseId);

    // 지출 수정 알림 이벤트 발송 (딥링크 포함)
    const currentUserName = this.getMemberProfile(context, userId)?.name || '사용자';
    await this.pushNotificationService.sendExpenseNotification(
      'expense_updated',
      travelId,
      expenseId,
      userId,
      currentUserName,
      payload.title,
      context.memberIds,
      payload.amount,
      payload.currency
    );

    // Analytics 전송 (비동기)
    this.analyticsService.trackEvent(
      'expense_updated',
      {
        travel_id: travelId,
        expense_id: result.id,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        participant_count: participantIds.length,
      },
      { userId },
    ).catch(() => undefined);

    return result;
  }

  /**
   * 지출을 삭제합니다.
   * 권한: 지출 작성자만 삭제 가능
   */
  async deleteExpense(travelId: string, expenseId: string, userId: string): Promise<void> {
    // 1. 사용자가 여행 멤버인지 확인
    const context = await this.getTravelContext(travelId, userId);

    // 2. 지출 정보 조회 및 권한 확인
    const expense = await this.expenseRepository.findExpenseWithDetails(expenseId);
    if (!expense || expense.travelId !== travelId) {
      throw new NotFoundException('지출을 찾을 수 없습니다.');
    }

    // 3. 권한 확인: 지출 작성자만 삭제 가능
    if (expense.authorId !== userId) {
      throw new ForbiddenException('지출 작성자만 삭제할 수 있습니다.');
    }

    // 4. 트랜잭션으로 지출 및 관련 데이터 삭제
    await this.dataSource.transaction(async (manager) => {
      // TypeORM을 사용하여 참여자 정보 먼저 삭제 (외래키 제약)
      await this.participantRepository.removeAllParticipants(expenseId);

      // TypeORM을 사용하여 지출 정보 삭제
      const deleteResult = await manager.delete(TravelExpenseEntity, {
        id: expenseId,
        travelId,
      });

      if (deleteResult.affected === 0) {
        throw new NotFoundException('삭제할 지출을 찾을 수 없습니다.');
      }
    });

    // 삭제 후 캐시 무효화 (동기로 처리해 즉시 반영)
    await this.invalidateExpenseCaches(travelId, expenseId);

    // 지출 삭제 알림 이벤트 발송 (딥링크는 여행 상세로)
    const currentUserName = this.getMemberProfile(context, userId)?.name || '사용자';
    await this.pushNotificationService.sendExpenseNotification(
      'expense_deleted',
      travelId,
      expenseId,
      userId,
      currentUserName,
      expense.title,
      context.memberIds
    );

    // Analytics 전송 (비동기)
    this.analyticsService.trackEvent(
      'expense_deleted',
      {
        travel_id: travelId,
        expense_id: expenseId,
      },
      { userId },
    ).catch(() => undefined);
  }

  /**
   * 개선된 expense 변환 메서드 - 날짜 처리 최적화 및 재사용 가능
   */
  private transformExpenseToResponse(expense: any) {
    return {
      id: expense.id,
      title: expense.title,
      note: expense.note,
      amount: expense.amount,
      currency: expense.currency,
      converted_amount: expense.convertedAmount,
      expense_date: expense.expenseDate instanceof Date
        ? expense.expenseDate.toISOString().split('T')[0]
        : expense.expenseDate,
      category: expense.category,
      author_id: expense.authorId,
      payer_id: expense.payerId,
      payer_name: expense.payer?.name || null,
      payer_email: expense.payer?.email || null,
      payer_avatar: expense.payer?.avatarUrl || null,
      participants: expense.participants?.map((participant: any) => ({
        memberId: participant.memberId,
        name: participant.member?.name || null,
        email: participant.member?.email || null,
        avatarUrl: participant.member?.avatarUrl || null
      })) || []
    };
  }
}
