export interface TravelListOptions {
  userId?: string;
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'created_at' | 'start_date' | 'end_date' | 'title';
  sortOrder?: 'ASC' | 'DESC';
}

export interface TravelStats {
  totalExpenses: number;
  expenseCount: number;
  memberCount: number;
}

export interface TravelWithStats {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  memberCount: number;
  totalExpenses: number;
  totalBudget: number;
}