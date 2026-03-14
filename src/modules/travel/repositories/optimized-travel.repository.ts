import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Travel } from '../entities/travel.entity';
import { TravelMember } from '../entities/travel-member.entity';

interface OptimizedTravelRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  country_code: string;
  country_name_kr?: string;
  country_currencies: string[];
  base_currency: string;
  base_exchange_rate: number;
  budget?: number;
  budget_currency?: string;
  invite_code?: string;
  status: string;
  role: string;
  created_at: string;
  owner_name: string | null;
  members?: any;
  member_count?: number;
}

@Injectable()
export class OptimizedTravelRepository {
  constructor(
    @InjectRepository(Travel)
    private readonly travelRepository: Repository<Travel>,
    @InjectRepository(TravelMember)
    private readonly travelMemberRepository: Repository<TravelMember>,
  ) {}

  async getTotalTravelsCount(
    userId: string,
    status?: 'active' | 'archived',
  ): Promise<number> {
    const connection = this.travelRepository.manager.connection;
    const statusCondition = this.buildStatusCondition(status);

    const query = `
      SELECT COUNT(*)::int AS total
      FROM travel_members tm
      INNER JOIN travels t ON t.id = tm.travel_id
      WHERE tm.user_id = $1
      ${statusCondition}
    `;

    const result = await connection.query(query, [userId]);
    return result[0]?.total || 0;
  }

  async getTravelsList(
    userId: string,
    limit: number,
    offset: number,
    includeMembers: boolean,
    status: 'active' | 'archived' | undefined,
    sort: 'recent' | 'start_date' | 'start_date_desc',
  ): Promise<OptimizedTravelRow[]> {
    // For complex queries with JSON aggregation, we'll use raw query through repository connection
    const connection = this.travelRepository.manager.connection;

    const statusCondition = this.buildStatusCondition(status);
    const orderClause = this.buildOrderClause(sort);

    let query: string;
    if (includeMembers) {
      query = `
        SELECT
          t.id::text AS id,
          t.title,
          to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date,
          to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date,
          t.country_code,
          t.country_name_kr,
          t.country_currencies,
          t.base_currency,
          t.base_exchange_rate,
          t.budget,
          t.budget_currency,
          ti.invite_code,
          CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status,
          tm.role,
          t.created_at::text,
          owner_profile.name AS owner_name,
          COALESCE(members.members, '[]'::json) AS members
        FROM travels t
        INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
        INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
        LEFT JOIN travel_invites ti ON ti.travel_id = t.id AND ti.status = 'active'
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'userId', tm2.user_id,
              'name', COALESCE(tm2.display_name, p.name),
              'role', tm2.role
            )
            ORDER BY tm2.joined_at
          ) AS members
          FROM travel_members tm2
          LEFT JOIN profiles p ON p.id = tm2.user_id
          WHERE tm2.travel_id = t.id
        ) AS members ON TRUE
        WHERE 1 = 1
        ${statusCondition}
        ${orderClause}
        LIMIT $2 OFFSET $3
      `;
    } else {
      query = `
        SELECT
          t.id::text AS id,
          t.title,
          to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date,
          to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date,
          t.country_code,
          t.country_name_kr,
          t.country_currencies,
          t.base_currency,
          t.base_exchange_rate,
          t.budget,
          t.budget_currency,
          ti.invite_code,
          CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status,
          tm.role,
          t.created_at::text,
          owner_profile.name AS owner_name,
          member_counts.member_count
        FROM travels t
        INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
        INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
        LEFT JOIN travel_invites ti ON ti.travel_id = t.id AND ti.status = 'active'
        LEFT JOIN (
          SELECT travel_id, COUNT(*)::int AS member_count
          FROM travel_members
          GROUP BY travel_id
        ) AS member_counts ON member_counts.travel_id = t.id
        WHERE 1 = 1
        ${statusCondition}
        ${orderClause}
        LIMIT $2 OFFSET $3
      `;
    }

    return connection.query(query, [userId, limit, offset]);
  }

  private buildStatusCondition(status?: 'active' | 'archived'): string {
    if (status === 'active') {
      return 'AND t.end_date >= CURRENT_DATE';
    }
    if (status === 'archived') {
      return 'AND t.end_date < CURRENT_DATE';
    }
    return '';
  }

  private buildOrderClause(sort: 'recent' | 'start_date' | 'start_date_desc'): string {
    switch (sort) {
      case 'start_date':
        return 'ORDER BY t.start_date ASC, t.created_at DESC';
      case 'start_date_desc':
        return 'ORDER BY t.start_date DESC, t.created_at DESC';
      default:
        return 'ORDER BY t.created_at DESC';
    }
  }

  async getTravelDetail(travelId: string, userId: string): Promise<OptimizedTravelRow | null> {
    const connection = this.travelRepository.manager.connection;

    const query = `
      SELECT
        t.id::text AS id,
        t.title,
        to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date,
        to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date,
        t.country_code,
        t.country_name_kr,
        t.country_currencies,
        t.base_currency,
        t.base_exchange_rate,
        t.budget,
        t.budget_currency,
        t.invite_code,
        t.status,
        t.created_at::text,
        tm.role,
        owner_profile.name AS owner_name,
        COALESCE(members.members, '[]'::json) AS members
      FROM travels t
      INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $2
      INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'userId', tm2.user_id,
            'name', COALESCE(tm2.display_name, p.name),
            'role', tm2.role
          )
          ORDER BY tm2.joined_at
        ) AS members
        FROM travel_members tm2
        LEFT JOIN profiles p ON p.id = tm2.user_id
        WHERE tm2.travel_id = t.id
      ) AS members ON TRUE
      WHERE t.id = $1
    `;

    const result = await connection.query(query, [travelId, userId]);
    return result[0] || null;
  }

  async getTravelsBatch(travelIds: string[]): Promise<OptimizedTravelRow[]> {
    if (travelIds.length === 0) {
      return [];
    }

    const connection = this.travelRepository.manager.connection;
    const placeholders = travelIds.map((_, i) => `$${i + 1}`).join(',');

    const query = `
      SELECT
        t.id::text AS id,
        t.title,
        to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date,
        to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date,
        t.country_code,
        t.country_name_kr,
        t.base_currency,
        t.base_exchange_rate,
        t.budget,
        t.budget_currency,
        t.invite_code,
        t.status,
        t.created_at::text,
        owner_profile.name AS owner_name
      FROM travels t
      INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
      WHERE t.id IN (${placeholders})
    `;

    return connection.query(query, travelIds);
  }
}