export interface Entry {
  id: string;
  DATA: string;
  "KM's": number;
  [key: string]: any;
}

export interface ContractSettings {
  plate: string;
  startDate: string;
  duration: number;
  limit: number;
  maxLimit: number;
  costPerKm: number;
}

export interface ContractHistoryEntry {
  plate: string;
  start_date: string;
  duration: number;
  limit_km: number;
  max_limit_km: number;
  cost_per_km: number;
  renewed_at: string;
}

export interface SyncPayload {
  version: string;
  exported_at: string;
  contracts: Array<{
    plate: string;
    start_date: string;
    duration: number;
    limit_km: number;
    max_limit_km: number;
    cost_per_km: number;
  }>;
  mileage: Array<{
    id: string;
    plate: string;
    date: string;
    kms: number;
  }>;
  contract_history: ContractHistoryEntry[];
}
