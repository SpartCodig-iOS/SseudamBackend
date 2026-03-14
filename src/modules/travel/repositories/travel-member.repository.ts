import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelMember } from '../entities/travel-member.entity';

@Injectable()
export class TravelMemberRepository {
  constructor(
    @InjectRepository(TravelMember)
    private readonly repository: Repository<TravelMember>,
  ) {}

  async findByTravelAndMember(travelId: string, userId: string): Promise<TravelMember | null> {
    return this.repository.findOne({
      where: { travelId, userId },
      relations: ['member'],
    });
  }

  async findByTravelId(travelId: string): Promise<TravelMember[]> {
    return this.repository.find({
      where: { travelId },
      relations: ['member'],
    });
  }

  async create(memberData: Partial<TravelMember>): Promise<TravelMember> {
    const member = this.repository.create(memberData);
    return this.repository.save(member);
  }

  async updateRole(travelId: string, userId: string, role: string): Promise<TravelMember | null> {
    await this.repository.update(
      { travelId, userId },
      { role: role as any }
    );
    return this.findByTravelAndMember(travelId, userId);
  }

  async remove(travelId: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ travelId, userId });
    return (result.affected || 0) > 0;
  }
}