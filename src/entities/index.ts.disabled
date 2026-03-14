// Stub exports for entities that need to exist for backwards compatibility
// These will be implemented properly in the Clean Architecture migration

export class JwtBlacklist {
  id!: string;
  token_id!: string;
  user_id!: string;
  expires_at!: Date;
  reason!: string;
  created_at!: Date;
}

export class User {
  id!: string;
  email!: string;
  name!: string | null;
  username!: string;
  password_hash!: string;
  role!: string;
  avatar_url!: string | null;
  created_at!: Date;
  updated_at!: Date;
}

export class Travel {
  id!: string;
  name!: string;
  description!: string | null;
  owner_id!: string;
  created_at!: Date;
  updated_at!: Date;
}

export class TravelMember {
  id!: string;
  travel_id!: string;
  user_id!: string;
  role!: string;
  joined_at!: Date;
}

export class TravelExpense {
  id!: string;
  travel_id!: string;
  author_id!: string;
  title!: string;
  amount!: number;
  currency!: string;
  created_at!: Date;
  updated_at!: Date;
}

export class TravelExpenseParticipant {
  id!: string;
  expense_id!: string;
  user_id!: string;
  share_amount!: number;
}

export class TravelSettlement {
  id!: string;
  travel_id!: string;
  created_at!: Date;
}

export class AppVersion {
  id!: string;
  version!: string;
  platform!: string;
  created_at!: Date;
}