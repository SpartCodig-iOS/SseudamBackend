import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelMember, TravelMemberRole } from '../entities/travel-member.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class TravelMemberRepository extends BaseRepository<TravelMember> {
  constructor(
    @InjectRepository(TravelMember)
    travelMemberRepository: Repository<TravelMember>
  ) {
    super(travelMemberRepository);
  }

  async findByTravelAndUser(travelId: string, userId: string): Promise<TravelMember | null> {
    return this.repository.findOne({
      where: { travelId, userId },
      relations: ['user', 'travel'],
    });
  }

  async findTravelMembers(travelId: string): Promise<TravelMember[]> {
    return this.repository.find({
      where: { travelId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  async findUserTravels(userId: string): Promise<TravelMember[]> {
    return this.repository.find({
      where: { userId },
      relations: ['travel', 'travel.user'],
      order: { joinedAt: 'DESC' },
    });
  }

  async addMember(travelId: string, userId: string, role: TravelMemberRole = TravelMemberRole.MEMBER): Promise<TravelMember> {
    const member = this.repository.create({
      travelId,
      userId,
      role,
    });

    return this.repository.save(member);
  }

  async removeMember(travelId: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ travelId, userId });
    return result.affected !== 0;
  }

  async updateMemberRole(travelId: string, userId: string, role: TravelMemberRole): Promise<TravelMember | null> {
    await this.repository.update({ travelId, userId }, { role });
    return this.findByTravelAndUser(travelId, userId);
  }

  async isMember(travelId: string, userId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { travelId, userId },
    });
    return count > 0;
  }

  async hasRole(travelId: string, userId: string, roles: TravelMemberRole[]): Promise<boolean> {
    const count = await this.repository.count({
      where: {
        travelId,
        userId,
        role: roles.length === 1 ? roles[0] : undefined,
      },
    });

    if (roles.length === 1) {
      return count > 0;
    }

    // For multiple roles, use query builder
    const member = await this.repository.findOne({
      where: { travelId, userId },
    });

    return member ? roles.includes(member.role) : false;
  }

  async isOwnerOrEditor(travelId: string, userId: string): Promise<boolean> {
    return this.hasRole(travelId, userId, [TravelMemberRole.OWNER, TravelMemberRole.EDITOR]);
  }

  async getMemberCount(travelId: string): Promise<number> {
    return this.repository.count({
      where: { travelId },
    });
  }

  async transferOwnership(travelId: string, currentOwnerId: string, newOwnerId: string): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      // Update current owner to editor
      await manager.update(TravelMember,
        { travelId, userId: currentOwnerId },
        { role: TravelMemberRole.EDITOR }
      );

      // Update new owner
      await manager.update(TravelMember,
        { travelId, userId: newOwnerId },
        { role: TravelMemberRole.OWNER }
      );
    });
  }

  async findMembersWithUsers(travelId: string): Promise<TravelMember[]> {
    return this.repository.createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.travelId = :travelId', { travelId })
      .orderBy('member.role', 'ASC')
      .addOrderBy('member.joinedAt', 'ASC')
      .getMany();
  }

  async bulkRemoveMembers(travelId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    await this.repository.createQueryBuilder()
      .delete()
      .where('travelId = :travelId', { travelId })
      .andWhere('userId IN (:...userIds)', { userIds })
      .execute();
  }
}