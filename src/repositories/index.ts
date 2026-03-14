// Stub repositories for backwards compatibility

export class UserRepository {
  async findById(id: string) { return null; }
  async create(data: any) { return data; }
}

export class TravelRepository {
  async findById(id: string) { return null; }
  async create(data: any) { return data; }
}

export class TravelMemberRepository {
  async findById(id: string) { return null; }
  async create(data: any) { return data; }
}

export class TravelExpenseRepository {
  async findById(id: string) { return null; }
  async create(data: any) { return data; }
}

export class TravelExpenseParticipantRepository {
  async findById(id: string) { return null; }
  async create(data: any) { return data; }
}

export class TravelSettlementRepository {
  async findById(id: string) { return null; }
  async create(data: any) { return data; }
}

export class AppVersionRepository {
  async findLatest() { return null; }
  async create(data: any) { return data; }
}