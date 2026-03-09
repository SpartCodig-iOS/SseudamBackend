import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserRole, USER_ROLE_VALUES } from '../types/user';
import { LoginType } from '../types/auth';
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

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /**
   * 이메일/비밀번호 로그인 시 bcrypt 해시값. 소셜 로그인 전용 계정은 null 가능.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  password_hash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ type: 'text', nullable: true })
  avatar_url!: string | null;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  username!: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'login_type',
  })
  login_type!: LoginType | null;

  @Column({
    type: 'enum',
    enum: USER_ROLE_VALUES,
    default: 'user',
  })
  role!: UserRole;

  /**
   * Apple 소셜 로그인 refresh token (계정 탈퇴 시 연결 해제에 사용)
   */
  @Column({ type: 'text', nullable: true, name: 'apple_refresh_token' })
  apple_refresh_token!: string | null;

  /**
   * Google 소셜 로그인 refresh token (계정 탈퇴 시 연결 해제에 사용)
   */
  @Column({ type: 'text', nullable: true, name: 'google_refresh_token' })
  google_refresh_token!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updated_at!: Date;

  // Relations - Using forward references to avoid circular dependencies
  @OneToMany('Travel', 'user')
  travels!: any[];

  @OneToMany('TravelExpense', 'user')
  expenses!: any[];

  constructor(partial: Partial<User> = {}) {
    Object.assign(this, partial);
  }
}