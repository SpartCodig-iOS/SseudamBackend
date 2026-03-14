import { Travel, TravelStatus } from '../entities/travel.entity';
import { TravelListOptions, TravelStats } from '../types/travel.types';

export interface ITravelRepository {
  findById(id: string): Promise<Travel | null>;
  findByInviteCode(inviteCode: string): Promise<Travel | null>;
  findTravelsByUser(userId: string, options?: TravelListOptions): Promise<[Travel[], number]>;
  findTravelWithDetails(travelId: string, userId?: string): Promise<Travel | null>;
  findUpcomingTravels(userId: string, days?: number): Promise<Travel[]>;
  findActiveTravels(userId: string): Promise<Travel[]>;
  create(travel: Partial<Travel>): Promise<Travel>;
  update(id: string, travel: Partial<Travel>): Promise<Travel | null>;
  updateStatus(travelId: string, status: TravelStatus): Promise<Travel | null>;
  delete(id: string): Promise<void>;
  exists(criteria: Partial<Travel>): Promise<boolean>;
  generateUniqueInviteCode(): Promise<string>;
  getTravelStats(travelId: string): Promise<TravelStats>;
  checkUserAccess(travelId: string, userId: string): Promise<boolean>;
}