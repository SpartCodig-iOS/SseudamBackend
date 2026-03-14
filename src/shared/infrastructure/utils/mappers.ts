export interface MapperOptions {
  excludeFields?: string[];
  includeFields?: string[];
}

export class BaseMapper {
  static mapToDto<T, U>(
    entity: T,
    dtoClass: new () => U,
    options?: MapperOptions
  ): U {
    const dto = new dtoClass();

    if (!entity) {
      return dto;
    }

    const entityKeys = Object.keys(entity as object);
    const includeFields = options?.includeFields;
    const excludeFields = options?.excludeFields || [];

    for (const key of entityKeys) {
      if (excludeFields.includes(key)) {
        continue;
      }

      if (includeFields && !includeFields.includes(key)) {
        continue;
      }

      (dto as any)[key] = (entity as any)[key];
    }

    return dto;
  }

  static mapToDtoArray<T, U>(
    entities: T[],
    dtoClass: new () => U,
    options?: MapperOptions
  ): U[] {
    if (!entities || !Array.isArray(entities)) {
      return [];
    }

    return entities.map(entity => this.mapToDto(entity, dtoClass, options));
  }
}

// Supabase User to UserRecord mapper
export function fromSupabaseUser(user: any): any {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatar_url: user.avatar_url,
    role: user.role,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

// Profile response mapper
export function toProfileResponse(user: any): any {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname || user.name,
    profileImageUrl: user.profileImageUrl || user.avatar_url,
    role: user.role,
    createdAt: user.createdAt || user.created_at,
    updatedAt: user.updatedAt || user.updated_at,
  };
}

export const mappers = {
  BaseMapper,
  fromSupabaseUser,
  toProfileResponse,
};