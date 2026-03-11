import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserRole, USER_ROLE_VALUES } from '../types/user.types';
import { LoginType } from '../../auth/types/auth.types';
// Forward references to avoid circular dependencies

/**
 * profiles 테이블에 매핑되는 User 엔티티
 * Supabase auth.users 와 1:1 연결되며, 애플리케이션 프로필 정보를 관리합니다.
 */
@Entity('profiles')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
export class User {
  /**
   * Supabase auth.users.id 와 동일한 UUID (PrimaryGeneratedColumn 대신 PrimaryColumn 사용)
   */
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  // DB 스키마: text 타입
  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'text', nullable: true })
  avatar_url!: string | null;

  // DB 스키마: text, nullable
  @Column({ type: 'text', unique: true, nullable: true })
  username!: string | null;

  @Column({
    type: 'text',
    nullable: true,
    name: 'login_type',
  })
  login_type!: LoginType | null;

  // DB 스키마: text (enum 아님)
  @Column({ type: 'text', default: 'user' })
  role!: UserRole;

  @CreateDateColumn({ type: 'timestamp with time zone', nullable: true, name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', nullable: true, name: 'updated_at' })
  updated_at!: Date;

  /**
   * DB에 없는 가상 필드 — 코드 호환성을 위해 유지 (항상 null).
   * 비밀번호는 Supabase Auth에만 저장되며 profiles 테이블에는 없음.
   */
  password_hash: string | null = null;

  /** DB에 없는 가상 필드 — 코드 호환성 유지 */
  apple_refresh_token: string | null = null;

  /** DB에 없는 가상 필드 — 코드 호환성 유지 */
  google_refresh_token: string | null = null;

  // Relations - Using forward references to avoid circular dependencies
  @OneToMany('Travel', 'user')
  travels!: any[];

  @OneToMany('TravelExpense', 'user')
  expenses!: any[];

  constructor(partial: Partial<User> = {}) {
    Object.assign(this, partial);
  }
}