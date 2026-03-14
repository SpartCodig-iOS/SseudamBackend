import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CreateExpenseInput } from '../../validators/travelExpenseSchemas';
import { MetaService } from '../meta/meta.service';
import { CacheService } from '../cache-shared/services/cacheService';
import { PushNotificationService } from '../notification/services/push-notification.service';
import { AnalyticsService } from '../core/services/analytics.service';
import { ProfileService } from '../profile/profile.service';
import { QueueEventService } from '../queue/services/queue-event.service';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';
import { TravelExpense } from './entities/travel-expense.entity';
import { TravelExpenseParticipant } from './entities/travel-expense-participant.entity';
import { Travel } from '../travel/entities/travel.entity';
import { TravelMember } from '../travel/entities/travel-member.entity';
import { Profile } from '../../entities/profile.entity';

interface TravelContext {
  id: string;
  baseCurrency: string;
  baseExchangeRate: number;
  memberIds: string[];
  memberNameMap: Map<string, string | null>;
  memberEmailMap: Map<string, string | null>;
  memberAvatarMap: Map<string, string | null>;
}

export interface TravelExpenseDto {
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
  participants: TravelExpenseParticipantDto[];
  expenseMembers?: TravelExpenseMember[];
}

export interface TravelExpenseMember {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface TravelExpenseParticipantDto {
  memberId: string;
  name: string | null;
}

@Injectable()
export class TravelExpenseService {
  constructor(
    @InjectRepository(TravelExpense)
    private readonly expenseRepository: Repository<TravelExpense>,
    @InjectRepository(TravelExpenseParticipant)
    private readonly participantRepository: Repository<TravelExpenseParticipant>,
    @InjectRepository(Travel)
    private readonly travelRepository: Repository<Travel>,
    @InjectRepository(TravelMember)
    private readonly travelMemberRepository: Repository<TravelMember>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
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

    // TypeORM을 사용한 여행 컨텍스트 조회
    const travel = await this.travelRepository
      .createQueryBuilder('travel')
      .leftJoinAndSelect('travel.members', 'member')
      .leftJoinAndSelect('member.user', 'profile')
      .where('travel.id = :travelId', { travelId })
      .getOne();

    if (!travel) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }

    const rawMembers = travel.members?.map(member => ({
      id: member.user_id,
      name: member.user?.name || null,
      email: member.user?.email || null,
      avatar_url: member.user?.avatar_url || null
    })) || [];

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
      id: travel.id,
      baseCurrency: travel.base_currency || 'KRW',
      baseExchangeRate: Number(travel.base_exchange_rate ?? 0),
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

  private toParticipant(member: TravelExpenseMember | null): TravelExpenseParticipantDto | null {
    if (!member) return null;
    return { memberId: member.userId, name: member.name };
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

  private async getCachedExpenseList(cacheKey: string): Promise<TravelExpenseDto[] | null> {
    try {
      return await this.cacheService.get<TravelExpenseDto[]>(cacheKey, {
        prefix: this.EXPENSE_LIST_PREFIX,
      });
    } catch {
      return null;
    }
  }

  private async setCachedExpenseList(cacheKey: string, payload: TravelExpenseDto[]): Promise<void> {
    this.cacheService.set(cacheKey, payload, {
      prefix: this.EXPENSE_LIST_PREFIX,
      ttl: this.EXPENSE_LIST_TTL_SECONDS,
    }).catch(() => undefined);
  }

  private async getCachedExpenseDetail(expenseId: string): Promise<TravelExpenseDto | null> {
    try {
      return await this.cacheService.get<TravelExpenseDto>(expenseId, { prefix: this.EXPENSE_DETAIL_PREFIX });
    } catch {
      return null;
    }
  }

  private async setCachedExpenseDetail(expenseId: string, expense: TravelExpenseDto): Promise<void> {
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
    const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));

    let expense: any;
    let participants: TravelExpenseParticipant[] = [];
    let payerProfile: TravelExpenseMember | null = null;
    let expenseMembers: TravelExpenseMember[] = [];

    await this.dataSource.transaction(async (manager) => {
      const expenseResult = await manager.query(
        `INSERT INTO travel_expenses
           (travel_id, title, note, amount, currency, converted_amount, expense_date, category, payer_id, author_id)
         VALUES
           ($1, $2, $3, $4, $5, $6, to_date($7, 'YYYY-MM-DD'), $8, $9, $10)
         RETURNING
           id::text,
           title,
           note,
           amount,
           currency,
           converted_amount,
           expense_date::date::text,
           category,
           payer_id::text,
           author_id::text`,
        [
          travelId,
          payload.title,
          payload.note ?? null,
          payload.amount,
          payload.currency.toUpperCase(),
          convertedAmount,
          expenseDate,
          payload.category ?? null,
          payerId,
          userId,
        ],
      );

      expense = Array.isArray(expenseResult) ? expenseResult[0] : expenseResult?.rows?.[0];
      // 배치 INSERT로 성능 최적화
      if (participantIds.length > 0) {
        await manager.query(
          `INSERT INTO travel_expense_participants (expense_id, member_id, split_amount)
           SELECT $1, unnest($2::uuid[]), $3`,
          [expense.id, participantIds, splitAmount],
        );
      }

      payerProfile = this.getMemberProfile(context, payerId);
      expenseMembers = context.memberIds.map((memberId) => this.getMemberProfile(context, memberId)!);
      participants = participantIds
        .map((memberId) => this.toParticipant(this.getMemberProfile(context, memberId)))
        .filter(Boolean) as TravelExpenseParticipant[];
    });

    {
      const result: TravelExpense = {
        id: expense.id,
        title: expense.title,
        note: expense.note,
        amount: Number(expense.amount),
        currency: expense.currency,
        convertedAmount: Number(expense.converted_amount),
        expenseDate,
        category: expense.category,
        authorId: expense.author_id,
        payerName: (payerProfile as TravelExpenseMember | null)?.name ?? null,
        payer: payerProfile as TravelExpenseMember | null,
        participants,
        expenseMembers,
      };

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
  }

  async listExpenses(
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
      const expenseMembers = context.memberIds.map((memberId) => this.getMemberProfile(context, memberId)!);
      return cached.map((item) => {
        const { payerId: _legacyPayerId, ...rest } = item as any;
        const payerProfile =
          this.normalizeMember(rest.payer) ??
          this.getMemberProfile(context, (_legacyPayerId as string) || rest.payer?.memberId || rest.payer?.userId) ??
          null;
        const normalizedExpenseMembers = (rest.expenseMembers ?? rest.travelMembers ?? expenseMembers).map((m: any) =>
          this.normalizeMember(m) ??
          this.getMemberProfile(context, m?.memberId || m?.userId) ?? {
            userId: m?.memberId || m?.userId,
            name: m?.name ?? null,
            email: null,
            avatarUrl: null,
          }
        );
        return {
          ...rest,
          payer: payerProfile,
          payerName: rest.payerName ?? payerProfile?.name ?? null,
          expenseMembers: normalizedExpenseMembers,
          participants: rest.participants?.map((p: any) => this.toParticipant(this.getMemberProfile(context, p.memberId)) ?? p) ?? [],
        };
      });
    }

    // 최적화: 모든 데이터를 한 번에 조회 (JOIN + JSON 집계) - 페이지네이션 없이 전체 반환
    const combinedRows = await this.dataSource.query(
      `WITH expense_list AS (
        SELECT
          e.id::text,
          e.title,
          e.note,
          e.amount,
          e.currency,
          e.converted_amount,
          to_char(e.expense_date::date, 'YYYY-MM-DD') as expense_date,
          e.category,
          e.author_id::text,
          e.payer_id::text,
          COALESCE(e.display_name, payer.name) AS payer_name,
          payer.email AS payer_email,
          payer.avatar_url AS payer_avatar,
          ROW_NUMBER() OVER (ORDER BY e.expense_date::date DESC, e.created_at DESC) as row_num
        FROM travel_expenses e
        LEFT JOIN profiles payer ON payer.id = e.payer_id
        WHERE e.travel_id = $1 ${dateFilter}
      )
       SELECT
         el.*,
        COALESCE(
          json_agg(
            json_build_object(
              'memberId', tep.member_id::text,
              'name', COALESCE(tep.display_name, p.name),
              'email', p.email,
              'avatarUrl', p.avatar_url
            )
            ORDER BY p.name
          ) FILTER (WHERE tep.member_id IS NOT NULL),
          '[]'::json
        ) as participants
       FROM expense_list el
       LEFT JOIN travel_expense_participants tep ON tep.expense_id = el.id::uuid
       LEFT JOIN profiles p ON p.id = tep.member_id
       GROUP BY el.id, el.title, el.note, el.amount, el.currency, el.converted_amount,
                el.expense_date, el.category, el.author_id, el.payer_id, el.payer_name, el.payer_email, el.payer_avatar,
                el.row_num
       ORDER BY el.row_num`,
      queryParams,
    );

    const expenseMembers = context.memberIds.map((memberId) => this.getMemberProfile(context, memberId)!);

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
    const existingExpenseRows = await this.dataSource.query(
      `SELECT
         e.id::text,
         e.travel_id::text,
         e.author_id::text
       FROM travel_expenses e
       WHERE e.id = $1 AND e.travel_id = $2`,
      [expenseId, travelId],
    );

    const existingExpense = existingExpenseRows[0];
    if (!existingExpense) {
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
    const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));

    // 4. 트랜잭션으로 지출 수정
    let updatedExpense: any;
    let updateParticipants: TravelExpenseParticipant[] = [];
    let updatePayerProfile: TravelExpenseMember | null = null;
    let updateExpenseMembers: TravelExpenseMember[] = [];

    await this.dataSource.transaction(async (manager) => {
      // 기존 지출 정보 업데이트
      const expenseResult = await manager.query(
        `UPDATE travel_expenses
         SET title = $3,
             note = $4,
             amount = $5,
             currency = $6,
             converted_amount = $7,
             expense_date = to_date($8, 'YYYY-MM-DD'),
             category = $9,
             payer_id = $10,
             updated_at = NOW()
         WHERE id = $1 AND travel_id = $2
         RETURNING
           id::text,
           title,
           note,
           amount,
           currency,
           converted_amount,
           expense_date::date::text,
           category,
           payer_id::text,
           author_id::text`,
        [
          expenseId,
          travelId,
          payload.title,
          payload.note ?? null,
          payload.amount,
          payload.currency.toUpperCase(),
          convertedAmount,
          expenseDate,
          payload.category ?? null,
          payerId,
        ],
      );

      updatedExpense = Array.isArray(expenseResult) ? expenseResult[0] : expenseResult?.rows?.[0];

      // 기존 참여자 정보 삭제 후 새로 추가
      await manager.query(
        `DELETE FROM travel_expense_participants WHERE expense_id = $1`,
        [expenseId],
      );

      if (participantIds.length > 0) {
        await manager.query(
          `INSERT INTO travel_expense_participants (expense_id, member_id, split_amount)
           SELECT $1, unnest($2::uuid[]), $3`,
          [updatedExpense.id, participantIds, splitAmount],
        );
      }

      updatePayerProfile = this.getMemberProfile(context, payerId);
      updateExpenseMembers = context.memberIds.map((memberId) => this.getMemberProfile(context, memberId)!);
      updateParticipants = participantIds
        .map((memberId) => this.toParticipant(this.getMemberProfile(context, memberId)))
        .filter(Boolean) as TravelExpenseParticipant[];
    });

    {
      const result: TravelExpense = {
        id: updatedExpense.id,
        title: updatedExpense.title,
        note: updatedExpense.note,
        amount: Number(updatedExpense.amount),
        currency: updatedExpense.currency,
        convertedAmount: Number(updatedExpense.converted_amount),
        expenseDate,
        category: updatedExpense.category,
        authorId: updatedExpense.author_id,
        payerName: (updatePayerProfile as TravelExpenseMember | null)?.name ?? null,
        payer: updatePayerProfile as TravelExpenseMember | null,
        participants: updateParticipants,
        expenseMembers: updateExpenseMembers,
      };

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
          expense_id: updatedExpense.id,
          amount: payload.amount,
          currency: payload.currency.toUpperCase(),
          participant_count: participantIds.length,
        },
        { userId },
      ).catch(() => undefined);

      return result;
    }
  }

  /**
   * 지출을 삭제합니다.
   * 권한: 지출 작성자만 삭제 가능
   */
  async deleteExpense(travelId: string, expenseId: string, userId: string): Promise<void> {
    // 1. 사용자가 여행 멤버인지 확인
    const context = await this.getTravelContext(travelId, userId);

    // 2. 지출 정보 조회 및 권한 확인
    const expenseRows = await this.dataSource.query(
      `SELECT
         e.id::text,
         e.travel_id::text,
         e.title,
         e.payer_id::text,
         e.author_id::text
       FROM travel_expenses e
       WHERE e.id = $1 AND e.travel_id = $2`,
      [expenseId, travelId],
    );

    const expense = expenseRows[0];
    if (!expense) {
      throw new NotFoundException('지출을 찾을 수 없습니다.');
    }

    // 3. 권한 확인: 지출 작성자만 삭제 가능
    if (expense.author_id !== userId) {
      throw new ForbiddenException('지출 작성자만 삭제할 수 있습니다.');
    }

    // 4. 트랜잭션으로 지출 및 관련 데이터 삭제
    await this.dataSource.transaction(async (manager) => {
      // 참여자 정보 먼저 삭제 (외래키 제약)
      await manager.query(
        `DELETE FROM travel_expense_participants WHERE expense_id = $1`,
        [expenseId],
      );

      // 지출 정보 삭제
      const deleteResult = await manager.query(
        `DELETE FROM travel_expenses WHERE id = $1 AND travel_id = $2`,
        [expenseId, travelId],
      );

      const affectedRows = Array.isArray(deleteResult) ? deleteResult[1] : deleteResult?.rowCount ?? 0;
      if (affectedRows === 0) {
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
}
