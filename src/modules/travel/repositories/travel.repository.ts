import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Travel } from '../entities/travel.entity';

@Injectable()
export class TravelRepository {
  constructor(
    @InjectRepository(Travel)
    private readonly repository: Repository<Travel>,
  ) {}

  async findById(id: string): Promise<Travel | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['members', 'members.member'],
    });
  }

  async findByMemberId(memberId: string): Promise<Travel[]> {
    return this.repository.find({
      where: { members: { userId: memberId } },
      relations: ['members', 'members.member'],
    });
  }

  async create(travelData: Partial<Travel>): Promise<Travel> {
    const travel = this.repository.create(travelData);
    return this.repository.save(travel);
  }

  async update(id: string, updateData: Partial<Travel>): Promise<Travel | null> {
    await this.repository.update(id, updateData);
    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repository.delete(id);
    return (result.affected || 0) > 0;
  }

  async findByInviteCode(inviteCode: string): Promise<Travel | null> {
    return this.repository.findOne({
      where: { inviteCode },
      relations: ['members'],
    });
  }
}