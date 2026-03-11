import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { User } from '../entities/user.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { UserRecord } from '../types/user.types';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    userRepository: Repository<User>
  ) {
    super(userRepository);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repository.findOne({
      where: { username },
    });
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.repository.findOne({
      where: [
        { email: identifier },
        { username: identifier },
      ],
    });
  }

  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    const query = this.repository.createQueryBuilder('user')
      .where('user.email = :email', { email });

    if (excludeUserId) {
      query.andWhere('user.id != :id', { id: excludeUserId });
    }

    const count = await query.getCount();
    return count > 0;
  }

  async isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
    const query = this.repository.createQueryBuilder('user')
      .where('user.username = :username', { username });

    if (excludeUserId) {
      query.andWhere('user.id != :id', { id: excludeUserId });
    }

    const count = await query.getCount();
    return count > 0;
  }

  async findUsersById(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) return [];

    return this.repository.findByIds(userIds);
  }

  async searchUsers(searchTerm: string, limit: number = 10): Promise<User[]> {
    return this.repository.createQueryBuilder('user')
      .where('user.name ILIKE :term OR user.username ILIKE :term OR user.email ILIKE :term', {
        term: `%${searchTerm}%`
      })
      .limit(limit)
      .getMany();
  }

  async getUserStats(userId: string): Promise<{
    totalTravels: number;
    totalExpenses: number;
  }> {
    const result = await this.repository.createQueryBuilder('user')
      .leftJoin('user.travels', 'travel')
      .leftJoin('user.expenses', 'expense')
      .select('COUNT(DISTINCT travel.id)', 'totalTravels')
      .addSelect('COUNT(DISTINCT expense.id)', 'totalExpenses')
      .where('user.id = :userId', { userId })
      .getRawOne();

    return {
      totalTravels: parseInt(result.totalTravels) || 0,
      totalExpenses: parseInt(result.totalExpenses) || 0,
    };
  }

  /**
   * 마지막 로그인 시간 갱신 - updated_at 컬럼만 NOW()로 업데이트합니다.
   * 불필요한 SELECT를 제거해 성능을 최적화합니다.
   */
  async markLastLogin(userId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(User)
      .set({ updated_at: () => 'NOW()' })
      .where('id = :userId', { userId })
      .execute();
  }

  /**
   * 특정 사용자의 소셜 로그인 타입과 refresh token을 한 번에 조회합니다.
   * deleteAccount 시 소셜 연결 해제에 사용됩니다.
   */
  async findSocialProfileInfo(userId: string): Promise<{
    login_type: string | null;
    apple_refresh_token: string | null;
    google_refresh_token: string | null;
    avatar_url: string | null;
  } | null> {
    // apple_refresh_token, google_refresh_token 은 DB profiles 테이블에 없음.
    // Supabase user_metadata에서 별도 조회 필요. 여기선 null 반환.
    const user = await this.repository
      .createQueryBuilder('user')
      .select([
        'user.login_type',
        'user.avatar_url',
      ])
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) return null;

    return {
      login_type: user.login_type,
      apple_refresh_token: null,
      google_refresh_token: null,
      avatar_url: user.avatar_url,
    };
  }

  // ─── utils/userRepository.ts 기능 통합 ──────────────────────

  /**
   * 전체 사용자 수를 반환합니다.
   * (기존 utils/userRepository.ts의 countUsers 대체)
   */
  async countUsers(): Promise<number> {
    return this.repository.count();
  }

  /**
   * 이메일(대소문자 무관)로 사용자를 조회합니다.
   * lower(email) = lower($1) 방식으로 대소문자 구분 없이 검색합니다.
   * (기존 utils/userRepository.ts의 findByEmail 대체)
   */
  async findByEmailCaseInsensitive(email: string): Promise<UserRecord | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();

    return user ? this.toUserRecord(user) : null;
  }

  /**
   * 사용자명(대소문자 무관)으로 사용자를 조회합니다.
   * (기존 utils/userRepository.ts의 findByUsername 대체)
   */
  async findByUsernameCaseInsensitive(username: string): Promise<UserRecord | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .where('lower(user.username) = lower(:username)', { username })
      .getOne();

    return user ? this.toUserRecord(user) : null;
  }

  /**
   * ID로 사용자를 UserRecord 형태로 조회합니다.
   * (기존 utils/userRepository.ts의 findById 대체)
   */
  async findByIdAsRecord(id: string): Promise<UserRecord | null> {
    const user = await this.repository.findOne({ where: { id } });
    return user ? this.toUserRecord(user) : null;
  }

  /**
   * ID로 사용자의 role만 조회합니다.
   * Guards의 권한 체크에 사용되며 불필요한 컬럼 로딩을 최소화합니다.
   */
  async findRoleById(id: string): Promise<string | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .select('user.role')
      .where('user.id = :id', { id })
      .getOne();
    return user?.role ?? null;
  }

  /**
   * 새 사용자를 생성하고 UserRecord 형태로 반환합니다.
   * (기존 utils/userRepository.ts의 createUser 대체)
   */
  async createUserRecord(params: {
    id: string;
    email: string;
    passwordHash: string;
    name?: string | null;
    avatarURL?: string | null;
    username: string;
    role?: string;
  }): Promise<UserRecord> {
    const entity = this.repository.create({
      id: params.id,
      email: params.email.toLowerCase(),
      password_hash: params.passwordHash,
      name: params.name ?? null,
      avatar_url: params.avatarURL ?? null,
      username: params.username,
      role: (params.role ?? 'user') as any,
    });

    const saved = await this.repository.save(entity);
    return this.toUserRecord(saved);
  }

  /**
   * 사용자를 물리 삭제합니다.
   * (기존 utils/userRepository.ts의 deleteUser 대체)
   * 계정 전체 삭제는 deleteAccountData() 사용을 권장합니다.
   */
  async deleteUserById(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  /**
   * User 엔티티를 UserRecord 인터페이스로 변환합니다.
   * password_hash는 항상 원본값을 유지합니다.
   */
  private toUserRecord(user: User): UserRecord {
    return {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash ?? '',
      name: user.name,
      avatar_url: user.avatar_url,
      username: user.username ?? '',
      role: user.role ?? 'user',
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  /**
   * TypeORM EntityManager를 사용한 계정 삭제 트랜잭션 내부 실행.
   * 외부에서 EntityManager(트랜잭션 컨텍스트)를 주입받아 사용합니다.
   *
   * 삭제 순서 (FK 제약 준수):
   * 1. travel_expense_participants (expense FK)
   * 2. travel_expenses (travel FK, payer FK)
   * 3. travel_members (user FK)
   * 4. user_sessions (user FK)
   * 5. profiles (최종 삭제)
   *
   * travel_invites, travel_settlements 는 엔티티가 없어 native query로 처리합니다.
   */
  async deleteAccountData(userId: string, manager: EntityManager): Promise<void> {
    // 1. travel_expense_participants: member_id 또는 payer expense 참조 제거
    await manager.query(
      `DELETE FROM travel_expense_participants
       WHERE member_id = $1
          OR expense_id IN (
            SELECT id FROM travel_expenses WHERE payer_id = $1
          )`,
      [userId],
    );

    // 2. travel_expenses: payer 또는 author 기준 삭제
    await manager.query(
      `DELETE FROM travel_expenses WHERE payer_id = $1 OR author_id = $1`,
      [userId],
    );

    // 3. travel_settlements: from_member 또는 to_member 기준 삭제 (엔티티 미존재)
    await manager.query(
      `DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1`,
      [userId],
    );

    // 4. travel_invites: created_by 기준 삭제 (엔티티 미존재)
    await manager.query(
      `DELETE FROM travel_invites WHERE created_by = $1`,
      [userId],
    );

    // 5. travel_members: user_id 기준 삭제
    await manager.query(
      `DELETE FROM travel_members WHERE user_id = $1`,
      [userId],
    );

    // 6. user_sessions: user_id 기준 삭제 (엔티티 미존재)
    await manager.query(
      `DELETE FROM user_sessions WHERE user_id = $1`,
      [userId],
    );

    // 7. profiles 본체 삭제
    await manager.delete(User, { id: userId });
  }
}