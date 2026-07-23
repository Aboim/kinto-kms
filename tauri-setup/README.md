# Tauri v2 Migration Plan - KINTO KMS

## Overview

This directory contains a complete scaffolding to migrate KINTO KMS from **Electron + Express** to **Tauri v2 (Rust)**.

| Electron Component          | Tauri v2 Replacement               |
|-----------------------------|------------------------------------|
| `electron-main.cjs`         | `src-tauri/src/main.rs` + `lib.rs` |
| `server.js` (Express)       | `src-tauri/src/commands/database.rs` |
| `preload.js` (IPC bridge)   | `#[tauri::command]` in `lib.rs`    |
| `tesseract.js` (OCR)        | `leptess` crate (`commands/ocr.rs`) |
| `jspdf` + `jspdf-autotable` | `printpdf` crate (`commands/pdf.rs`) |
| `xlsx` (SheetJS)            | `rust_xlsxwriter` + `calamine` (`commands/excel.rs`) |
| `node:sqlite`               | `rusqlite` (bundled)               |
| Express `localhost:3001`    | Direct IPC via `invoke()`          |
| `frontend` + `opencode`      | Same JS app, no HTTP roundtrip     |

---

## Prerequisites

### 1. Install Rust

```powershell
winget install --id Rustlang.Rustup
# or download from https://rustup.rs
```

Restart terminal, then verify:

```powershell
rustc --version
cargo --version
```

### 2. Install Tesseract OCR (system-wide, for OCR feature)

Download from: https://github.com/UB-Mannheim/tesseract/wiki

Install to `C:\Program Files\Tesseract-OCR\` and add to PATH.

### 3. Install Node.js dependencies for Tauri CLI

```powershell
cd "C:\Users\jaboi\Desktop\BACKUP_SSD\CODIGO PESSOAL\PROJECTOS\KINTO KMS"

# Install Tauri CLI and JS API
npm install --save-dev @tauri-apps/cli@latest
npm install @tauri-apps/api@latest
npm install @tauri-apps/plugin-dialog@latest
npm install @tauri-apps/plugin-fs@latest
npm install @tauri-apps/plugin-shell@latest
npm install @tauri-apps/plugin-notification@latest
```

### 4. Copy Tauri scaffolding into the project

```powershell
# Copy the src-tauri folder into the KINTO KMS project root
Copy-Item -Recurse -Path "tauri-setup\src-tauri" -Destination "."

# Copy the vite config and merge package.json additions
Copy-Item -Path "tauri-setup\vite-tauri.config.ts" -Destination "vite-tauri.config.ts"
```

---

## Step-by-Step Migration

### Step 1: Update `package.json`

Add these scripts to your existing `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "dev:tauri": "tauri dev",
    "build:tauri": "tauri build"
  }
}
```

And add `@tauri-apps/*` dependencies (see `package-tauri.json` for exact versions).

### Step 2: Update `package.json` main entry

Remove or update the `"main": "electron-main.cjs"` line since Tauri does not use it. The Vite entry point remains through `index.html`.

### Step 3: Replace the Vite config

Point your `vite.config.ts` to use the Tauri-compatible version:

```powershell
Copy-Item -Path "vite-tauri.config.ts" -Destination "vite.config.ts" -Force
```

Or merge the `server` and `build` options from `vite-tauri.config.ts` into your existing config.

### Step 4: Update `src/api.ts` to use Tauri IPC instead of HTTP + localStorage

Replace the content of `src/api.ts` to use `@tauri-apps/api` `invoke()` calls. Below is the full replacement:

```typescript
// src/api.ts - Tauri IPC version
import { invoke } from '@tauri-apps/api/core';
import type { Entry, ContractSettings, ContractHistoryEntry, SyncPayload } from './types';

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

export const storage: SyncStorageAdapter = {
    async fetchContracts() {
        return invoke('get_contracts');
    },
    async saveContract(settings: any) {
        return invoke('save_contract', { request: settings });
    },
    async deleteContract(plate: string) {
        return invoke('delete_contract', { plate });
    },
    async fetchMileage(plate: string) {
        const data: any[] = await invoke('get_mileage', { plate });
        return data.map((d: any) => ({ id: d.id, DATA: d.date, "KM's": d.kms }));
    },
    async saveMileage(entry) {
        return invoke('save_mileage', { request: entry });
    },
    async updateMileage(id: string, date: string, kms: number) {
        return invoke('update_mileage', { id, request: { date, kms } });
    },
    async deleteMileage(id: string) {
        return invoke('delete_mileage', { id });
    },
    async clearMileage(plate: string) {
        return invoke('clear_mileage', { plate });
    },
    async fetchAllContracts() {
        return invoke('get_contracts');
    },
    async fetchAllMileage() {
        return invoke('get_all_mileage');
    },
    async fetchContractHistory() {
        // Returns all contract history entries
        const contracts: any[] = await invoke('get_contracts');
        const history: ContractHistoryEntry[] = [];
        for (const c of contracts) {
            const h: any[] = await invoke('get_contract_history', { plate: c.plate });
            history.push(...h);
        }
        return history;
    },
    async saveContractHistory(entry: ContractHistoryEntry) {
        return invoke('save_contract_history', { entry });
    },
    async clearContractHistory(plate: string) {
        // Not implemented server-side; history is per-contract
    },
    async importContracts(contracts: any[]) {
        return invoke('import_contracts_json', { contracts });
    },
    async importMileage(mileage: any[]) {
        return invoke('import_mileage_json', { mileage });
    }
};

export function isOnline(): boolean {
    return true; // Tauri runs locally, always "online" for DB access
}
```

### Step 5: Update `src/main.ts` - OCR to use Tauri invoke

Replace the Tesseract.js OCR call with the Tauri IPC equivalent:

```typescript
// Instead of: const result = await Tesseract.recognize(processed, 'eng');
// Use:
import { invoke } from '@tauri-apps/api/core';

// In the OCR handler:
const file = (e.target as HTMLInputElement).files?.[0];
if (!file) return;

const reader = new FileReader();
reader.onload = async (e) => {
    const base64 = (e.target?.result as string).split(',')[1];
    try {
        const numbers = await invoke<string>('ocr_process', { imageB64: base64 });
        if (numbers && parseInt(numbers) > 0) {
            // ... same modal logic as before
        }
    } catch (err) {
        showToast('Erro ao processar imagem.', 'error');
    }
};
reader.readAsDataURL(file);
```

### Step 6: Update `src/main.ts` - PDF/Excel export to use Tauri

```typescript
// PDF export
document.getElementById('export-pdf')?.addEventListener('click', async () => {
    try {
        const path = await invoke<string>('generate_pdf', { plate: activePlate });
        showToast(`PDF guardado em: ${path}`, 'success');
    } catch (err) {
        showToast('Erro ao exportar PDF.', 'error');
    }
});

// Excel export
document.getElementById('export-excel')?.addEventListener('click', async () => {
    try {
        const path = await invoke<string>('generate_excel', { plate: activePlate });
        showToast(`Excel guardado em: ${path}`, 'success');
    } catch (err) {
        showToast('Erro ao exportar Excel.', 'error');
    }
});
```

### Step 7: Update `index.html` - Remove Capacitor reference

Remove the capacitor config script reference and the `node:sqlite` polyfill (not needed with Tauri):

```html
<!-- REMOVE these if present: -->
<!-- <script src="capacitor.js"></script> -->
```

### Step 8: Build and run

```powershell
# First run (dev mode with hot reload)
npm run dev:tauri

# Production build
npm run build:tauri
```

The bundled `.exe` / `.msi` will be in `src-tauri/target/release/bundle/`.

---

## Tauri Command Reference

| Command (JS invoke) | Rust Function | Description |
|---|---|---|
| `get_contracts` | `get_contracts` | Get all contracts |
| `get_contract` | `get_contract(plate)` | Get single contract |
| `save_contract` | `save_contract(request)` | Create or update contract |
| `delete_contract` | `delete_contract(plate)` | Delete contract + mileage |
| `get_mileage` | `get_mileage(plate)` | Get mileage for plate |
| `get_all_mileage` | `get_all_mileage` | Get all mileage (sync) |
| `save_mileage` | `save_mileage(request)` | Add mileage entry |
| `update_mileage` | `update_mileage(id, request)` | Update mileage entry |
| `delete_mileage` | `delete_mileage(id)` | Delete mileage entry |
| `clear_mileage` | `clear_mileage(plate)` | Delete all mileage for plate |
| `get_contract_history` | `get_contract_history(plate)` | Get renewal history |
| `save_contract_history` | `save_contract_history(entry)` | Save renewal record |
| `import_contracts_json` | `import_contracts_json(contracts)` | Bulk import contracts |
| `import_mileage_json` | `import_mileage_json(mileage)` | Bulk import mileage |
| `ocr_process` | `ocr_process(imageB64)` | OCR KMs from image |
| `generate_pdf` | `generate_pdf(plate)` | Generate PDF report |
| `generate_excel` | `generate_excel(plate)` | Generate Excel report |
| `get_api_key` | `get_api_key` | Get API key |
| `read_file` | `read_file(path)` | Read file contents |
| `write_file` | `write_file(path, data)` | Write file contents |
| `get_server_port` | `get_server_port` | Get server port (legacy) |
| `health_check` | `health_check` | Health check |
| `import_excel_file` | `import_excel_file(path, plate)` | Import Excel mileage |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  index.html + src/*.ts (Frontend - Vite + Chart.js) │
│  Uses: @tauri-apps/api invoke()                     │
├─────────────────────────────────────────────────────┤
│  Tauri v2 IPC Bridge (Rust ↔ JS)                    │
├─────────────────────────────────────────────────────┤
│  src-tauri/src/lib.rs (Command Dispatcher)           │
│  ├── commands/database.rs (rusqlite)                 │
│  ├── commands/ocr.rs (leptess)                       │
│  ├── commands/pdf.rs (printpdf)                      │
│  ├── commands/excel.rs (rust_xlsxwriter + calamine)  │
│  └── state.rs (Models + DB init)                     │
└─────────────────────────────────────────────────────┘
```

---

## Notes

- **SQLite**: Database file is stored at `{app_data_dir}/kinto_kms.db` (platform-specific app data folder, e.g. `%APPDATA%/com.kintokms.desktop/`)
- **OCR**: Requires Tesseract OCR system installation. The `leptess` crate is used via the Tesseract C API.
- **No HTTP server**: Tauri communicates directly via IPC, eliminating the need for `localhost:3001` or Express.
- **Smaller binary**: Tauri binaries are significantly smaller than Electron (~5-10MB vs ~150MB+)
- **Existing data migration**: Copy your existing `database.db` to `%APPDATA%/com.kintokms.desktop/kinto_kms.db` after first launch to migrate data.

### Data Migration

To move existing data:

```powershell
# Find Tauri app data dir after first launch
$appData = "$env:APPDATA\com.kintokms.desktop"
# Copy the existing SQLite database
Copy-Item -Path "database.db" -Destination "$appData\kinto_kms.db"
```

The schema is identical between the two databases.

---

## Troubleshooting

### `leptess` build fails
Ensure Tesseract is installed with development libraries. On Windows, install from https://github.com/UB-Mannheim/tesseract/wiki and add `C:\Program Files\Tesseract-OCR\` to your PATH and set the `TESSDATA_PREFIX` environment variable.

### `rusqlite` build fails (bundled)
If `rusqlite` with `bundled` feature fails, ensure you have a C compiler installed (comes with Rust via Build Tools).

### `printpdf` font issues
The built-in Helvetica font is used. For custom fonts, embed a `.ttf` file and use `PdfDocument::add_external_font()`.
