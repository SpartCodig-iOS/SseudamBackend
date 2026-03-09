"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
class BaseRepository {
    constructor(repository) {
        this.repository = repository;
    }
    async create(data) {
        const entity = this.repository.create(data);
        return this.repository.save(entity);
    }
    async findById(id, relations) {
        return this.repository.findOne({
            where: { id },
            relations,
        });
    }
    async findOne(where, relations) {
        return this.repository.findOne({
            where,
            relations,
        });
    }
    async findMany(options = {}) {
        return this.repository.find(options);
    }
    async findAndCount(options = {}) {
        return this.repository.findAndCount(options);
    }
    async update(id, data) {
        await this.repository.update(id, data);
        return this.findById(id);
    }
    async delete(id) {
        const result = await this.repository.delete(id);
        return result.affected !== 0;
    }
    async softDelete(id) {
        const result = await this.repository.softDelete(id);
        return result.affected !== 0;
    }
    async count(where) {
        return this.repository.count({ where });
    }
    async exists(where) {
        const count = await this.repository.count({ where });
        return count > 0;
    }
    getRepository() {
        return this.repository;
    }
}
exports.BaseRepository = BaseRepository;
