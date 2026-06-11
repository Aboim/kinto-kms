import type { ContractSettings, Entry } from './types';

export const ACTIVE_PLATE_KEY = 'kinto_tracker_active_plate';
export const THEME_KEY = 'kinto_theme';

export const defaultSettings: ContractSettings = {
  plate: '', 
  startDate: '2024-08-28', 
  duration: 60, 
  limit: 50000, 
  maxLimit: 65000, 
  costPerKm: 0.069
};

export interface AppState {
    plates: string[];
    activePlate: string;
    settings: ContractSettings;
    history: Entry[];
    editingId: string | null;
    isLight: boolean;
}

export const state: AppState = {
    plates: [],
    activePlate: localStorage.getItem(ACTIVE_PLATE_KEY) || '',
    settings: { ...defaultSettings },
    history: [],
    editingId: null,
    isLight: localStorage.getItem(THEME_KEY) === 'light'
};
