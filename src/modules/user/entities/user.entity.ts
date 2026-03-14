import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
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

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;


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
    type: 'text',
    default: 'user',
  })
  role!: string;


  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updated_at!: Date;

  @Column({ type: 'timestamp with time zone', name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  // Relations - Using forward references to avoid circular dependencies
  @OneToMany('Travel', 'user')
  travels!: any[];

  @OneToMany('TravelExpense', 'author')
  expenses!: any[];

  constructor(partial: Partial<User> = {}) {
    Object.assign(this, partial);
  }
}
