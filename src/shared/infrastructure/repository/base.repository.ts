import { Repository, FindOptionsWhere, FindManyOptions, DeepPartial } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export abstract class BaseRepository<T extends { id: string }> {
  protected repository: Repository<T>;

  constructor(repository: Repository<T>) {
    this.repository = repository;
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findById(id: string, relations?: string[]): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      relations,
    });
  }

  async findOne(where: FindOptionsWhere<T>, relations?: string[]): Promise<T | null> {
    return this.repository.findOne({
      where,
      relations,
    });
  }

  async findMany(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find(options);
  }

  async findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repository.findAndCount(options);
  }

  async update(id: string, data: QueryDeepPartialEntity<T>): Promise<T | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected !== 0;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository.softDelete(id);
    return result.affected !== 0;
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where });
  }

  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    const count = await this.repository.count({ where });
    return count > 0;
  }

  getRepository(): Repository<T> {
    return this.repository;
  }
}