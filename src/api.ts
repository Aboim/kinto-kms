import { Capacitor } from '@capacitor/core';
import type { Entry, ContractHistoryEntry } from './types';

export interface StorageAdapter {
    fetchContracts(): Promise<any[]>;
    saveContract(settings: any): Promise<void>;
    deleteContract(plate: string): Promise<void>;
    fetchMileage(plate: string): Promise<Entry[]>;
    saveMileage(entry: {id: string, plate: string, date: string, kms: number}): Promise<void>;
    updateMileage(id: string, date: string, kms: number): Promise<void>;
    deleteMileage(id: string): Promise<void>;
    clearMileage(plate: string): Promise<void>;
}

export interface SyncStorageAdapter extends StorageAdapter {
    fetchAllContracts(): Promise<any[]>;
    fetchAllMileage(): Promise<any[]>;
    fetchContractHistory(): Promise<ContractHistoryEntry[]>;
    saveContractHistory(entry: ContractHistoryEntry): Promise<void>;
    clearContractHistory(plate: string): Promise<void>;
    importContracts(contracts: any[]): Promise<void>;
    importMileage(mileage: any[]): Promise<void>;
}

const API_URL = 'http://localhost:3001/api';

let cachedApiKey: string | null = null;

async function getApiKey(): Promise<string> {
    if (cachedApiKey !== null) return cachedApiKey;
    try {
        const api = (window as any).electronAPI;
        if (api) {
            const rawKey: unknown = await api.readFile('.api-key');
            const key = typeof rawKey === 'string' ? rawKey.trim() : '';
            cachedApiKey = key;
            return key;
        }
    } catch {}
    cachedApiKey = '';
    return '';
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const key = await getApiKey();
    const headers: Record<string, string> = {};
    if (key) headers['x-api-key'] = key;
    if (options.headers) Object.assign(headers, options.headers as Record<string, string>);
    return fetch(url, { ...options, headers });
}

const getLocal = (key: string) => JSON.parse(localStorage.getItem(key) || '[]');
const setLocal = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

export const LocalStorageAdapter: StorageAdapter = {
    async fetchContracts() {
        return getLocal('kinto_contracts');
    },
    async saveContract(settings: any) {
        const contracts = getLocal('kinto_contracts');
        const { oldPlate, plate, startDate, duration, limit, maxLimit, costPerKm } = settings;
        const newContract = { plate, start_date: startDate, duration, limit_km: limit, max_limit_km: maxLimit, cost_per_km: costPerKm };
        const index = contracts.findIndex((c: any) => c.plate === (oldPlate || plate));
        
        if (index !== -1) {
            if (oldPlate && oldPlate !== plate) {
                const mileage = getLocal('kinto_mileage');
                setLocal('kinto_mileage', mileage.map((m: any) => m.plate === oldPlate ? { ...m, plate } : m));
            }
            contracts[index] = newContract;
        } else {
            contracts.push(newContract);
        }
        setLocal('kinto_contracts', contracts);
    },
    async deleteContract(plate: string) {
        setLocal('kinto_contracts', getLocal('kinto_contracts').filter((c: any) => c.plate !== plate));
        setLocal('kinto_mileage', getLocal('kinto_mileage').filter((m: any) => m.plate !== plate));
    },
    async fetchMileage(plate: string) {
        return getLocal('kinto_mileage')
            .filter((m: any) => m.plate === plate)
            .map((d: any) => ({ id: d.id, DATA: d.date, "KM's": d.kms }))
            .sort((a: any, b: any) => new Date(b.DATA).getTime() - new Date(a.DATA).getTime());
    },
    async saveMileage(entry) {
        const mileage = getLocal('kinto_mileage');
        mileage.push(entry);
        setLocal('kinto_mileage', mileage);
    },
    async updateMileage(id, date, kms) {
        const mileage = getLocal('kinto_mileage');
        const index = mileage.findIndex((m: any) => m.id === id);
        if (index !== -1) {
            mileage[index] = { ...mileage[index], date, kms };
            setLocal('kinto_mileage', mileage);
        }
    },
    async deleteMileage(id) {
        setLocal('kinto_mileage', getLocal('kinto_mileage').filter((m: any) => m.id !== id));
    },
    async clearMileage(plate) {
        setLocal('kinto_mileage', getLocal('kinto_mileage').filter((m: any) => m.plate !== plate));
    }
};

export const RestApiAdapter: StorageAdapter = {
    async fetchContracts() {
        const res = await authFetch(`${API_URL}/contracts`);
        if (!res.ok) throw new Error('Erro ao carregar contratos');
        return res.json();
    },
    async saveContract(settings: any) {
        const res = await authFetch(`${API_URL}/contracts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao guardar contrato');
        }
    },
    async deleteContract(plate: string) {
        const res = await authFetch(`${API_URL}/contracts/${plate}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao apagar contrato');
    },
    async fetchMileage(plate: string) {
        const res = await authFetch(`${API_URL}/mileage/${plate}`);
        if (!res.ok) throw new Error('Erro ao carregar histórico');
        const data = await res.json();
        return data.map((d: any) => ({ id: d.id, DATA: d.date, "KM's": d.kms }));
    },
    async saveMileage(entry) {
        const res = await authFetch(`${API_URL}/mileage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        if (!res.ok) throw new Error('Erro ao guardar registo');
    },
    async updateMileage(id, date, kms) {
        const res = await authFetch(`${API_URL}/mileage/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, kms })
        });
        if (!res.ok) throw new Error('Erro ao atualizar registo');
    },
    async deleteMileage(id) {
        const res = await authFetch(`${API_URL}/mileage/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao apagar registo');
    },
    async clearMileage(plate) {
        const res = await authFetch(`${API_URL}/mileage/plate/${plate}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao limpar histórico');
    }
};

async function fetchAllMileageFromServer(): Promise<any[]> {
    const res = await authFetch(`${API_URL}/mileage`);
    if (!res.ok) throw new Error('Erro ao carregar todos os registos');
    return res.json();
}

const ONLINE_STATUS_KEY = 'kinto_online_status';

function setOnlineStatus(online: boolean) {
    const prev = JSON.parse(localStorage.getItem(ONLINE_STATUS_KEY) || 'true');
    localStorage.setItem(ONLINE_STATUS_KEY, JSON.stringify(online));
    if (prev !== online) {
        window.dispatchEvent(new CustomEvent('kinto-online-change', { detail: { online } }));
    }
}

export function isOnline(): boolean {
    return JSON.parse(localStorage.getItem(ONLINE_STATUS_KEY) || 'true');
}

let onlineCheckInterval: ReturnType<typeof setInterval> | null = null;

async function checkOnlineStatus(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${API_URL}/health`, { signal: controller.signal, method: 'HEAD' });
        clearTimeout(timeoutId);
        const online = res.ok;
        setOnlineStatus(online);
        return online;
    } catch {
        setOnlineStatus(false);
        return false;
    }
}

function startOnlineMonitor() {
    if (onlineCheckInterval) return;
    onlineCheckInterval = setInterval(checkOnlineStatus, 15000);
    checkOnlineStatus();
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', () => setOnlineStatus(false));
}

function isNetworkError(err: any): boolean {
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch'))) return true;
    if (err.name === 'AbortError') return true;
    return false;
}

async function syncLocalToServer() {
    try {
        const localContracts = await LocalStorageAdapter.fetchContracts();
        for (const c of localContracts) {
            await RestApiAdapter.saveContract({
                plate: c.plate,
                startDate: c.start_date,
                duration: c.duration,
                limit: c.limit_km,
                maxLimit: c.max_limit_km,
                costPerKm: c.cost_per_km
            }).catch(() => {});
        }

        const localMileage = getLocal('kinto_mileage');
        let serverMileage: any[] = [];
        try {
            serverMileage = await fetchAllMileageFromServer();
        } catch { return; }
        const serverIds = new Set(serverMileage.map((m: any) => m.id));
        for (const m of localMileage) {
            if (!serverIds.has(m.id)) {
                await RestApiAdapter.saveMileage(m as any).catch(() => {});
            }
        }
    } catch {}
}

function createHybridStorageAdapter(): SyncStorageAdapter {
    async function tryRest<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
        if (!isOnline()) return fallback();
        try {
            const result = await fn();
            setOnlineStatus(true);
            return result;
        } catch (err: any) {
            if (isNetworkError(err)) {
                setOnlineStatus(false);
                return fallback();
            }
            throw err;
        }
    }

    return {
        async fetchContracts() {
            return tryRest(() => RestApiAdapter.fetchContracts(), () => LocalStorageAdapter.fetchContracts());
        },
        async saveContract(settings: any) {
            await tryRest(
                () => RestApiAdapter.saveContract(settings),
                async () => { await LocalStorageAdapter.saveContract(settings); }
            );
        },
        async deleteContract(plate: string) {
            await tryRest(
                () => RestApiAdapter.deleteContract(plate),
                async () => { await LocalStorageAdapter.deleteContract(plate); }
            );
        },
        async fetchMileage(plate: string) {
            return tryRest(
                () => RestApiAdapter.fetchMileage(plate),
                () => LocalStorageAdapter.fetchMileage(plate)
            );
        },
        async saveMileage(entry) {
            await tryRest(
                () => RestApiAdapter.saveMileage(entry),
                async () => { await LocalStorageAdapter.saveMileage(entry); }
            );
        },
        async updateMileage(id, date, kms) {
            await tryRest(
                () => RestApiAdapter.updateMileage(id, date, kms),
                async () => { await LocalStorageAdapter.updateMileage(id, date, kms); }
            );
        },
        async deleteMileage(id) {
            await tryRest(
                () => RestApiAdapter.deleteMileage(id),
                async () => { await LocalStorageAdapter.deleteMileage(id); }
            );
        },
        async clearMileage(plate) {
            await tryRest(
                () => RestApiAdapter.clearMileage(plate),
                async () => { await LocalStorageAdapter.clearMileage(plate); }
            );
        },
        async fetchAllContracts() {
            return tryRest(
                () => RestApiAdapter.fetchContracts(),
                () => LocalStorageAdapter.fetchContracts()
            );
        },
        async fetchAllMileage() {
            return tryRest(
                () => fetchAllMileageFromServer(),
                () => getLocal('kinto_mileage')
            );
        },
        async fetchContractHistory() {
            return getLocal('kinto_contract_history');
        },
        async saveContractHistory(entry: ContractHistoryEntry) {
            const history = getLocal('kinto_contract_history');
            history.push(entry);
            setLocal('kinto_contract_history', history);
        },
        async clearContractHistory(plate: string) {
            setLocal('kinto_contract_history', getLocal('kinto_contract_history').filter((c: any) => c.plate !== plate));
        },
        async importContracts(contracts: any[]) {
            const existing = getLocal('kinto_contracts');
            const existingPlates = new Set(existing.map((c: any) => c.plate));
            const newContracts: any[] = [];
            for (const c of contracts) {
                if (!existingPlates.has(c.plate)) {
                    existing.push(c);
                    existingPlates.add(c.plate);
                    newContracts.push(c);
                }
            }
            setLocal('kinto_contracts', existing);
            if (isOnline() && newContracts.length > 0) {
                for (const c of newContracts) {
                    await RestApiAdapter.saveContract({
                        plate: c.plate,
                        startDate: c.start_date,
                        duration: c.duration,
                        limit: c.limit_km,
                        maxLimit: c.max_limit_km,
                        costPerKm: c.cost_per_km
                    }).catch(() => {});
                }
            }
        },
        async importMileage(mileage: any[]) {
            const existing = getLocal('kinto_mileage');
            const existingIds = new Set(existing.map((m: any) => m.id));
            const newlyAdded: any[] = [];
            for (const m of mileage) {
                if (!existingIds.has(m.id)) {
                    existing.push(m);
                    existingIds.add(m.id);
                    newlyAdded.push(m);
                }
            }
            setLocal('kinto_mileage', existing);
            if (isOnline() && newlyAdded.length > 0) {
                for (const m of newlyAdded) {
                    await RestApiAdapter.saveMileage(m).catch(() => {});
                }
            }
        }
    };
}

const hybridAdapter = createHybridStorageAdapter();

function createNativeSyncAdapter(): SyncStorageAdapter {
    return {
        ...LocalStorageAdapter,
        async fetchAllContracts() { return LocalStorageAdapter.fetchContracts(); },
        async fetchAllMileage() { return getLocal('kinto_mileage'); },
        async fetchContractHistory() { return getLocal('kinto_contract_history'); },
        async saveContractHistory(entry: ContractHistoryEntry) {
            const history = getLocal('kinto_contract_history');
            history.push(entry);
            setLocal('kinto_contract_history', history);
        },
        async clearContractHistory(plate: string) {
            setLocal('kinto_contract_history', getLocal('kinto_contract_history').filter((c: any) => c.plate !== plate));
        },
        async importContracts(contracts: any[]) {
            const existing = getLocal('kinto_contracts');
            const existingPlates = new Set(existing.map((c: any) => c.plate));
            for (const c of contracts) {
                if (!existingPlates.has(c.plate)) {
                    existing.push(c);
                    existingPlates.add(c.plate);
                }
            }
            setLocal('kinto_contracts', existing);
        },
        async importMileage(mileage: any[]) {
            const existing = getLocal('kinto_mileage');
            const existingIds = new Set(existing.map((m: any) => m.id));
            for (const m of mileage) {
                if (!existingIds.has(m.id)) {
                    existing.push(m);
                    existingIds.add(m.id);
                }
            }
            setLocal('kinto_mileage', existing);
        }
    };
}

export const storage: SyncStorageAdapter = Capacitor.isNativePlatform()
    ? createNativeSyncAdapter()
    : hybridAdapter;

if (!Capacitor.isNativePlatform()) {
    startOnlineMonitor();
}

// Auto-sync to server when coming back online
window.addEventListener('kinto-online-change', ((e: CustomEvent) => {
    if (e.detail.online) {
        syncLocalToServer();
    }
}) as EventListener);
