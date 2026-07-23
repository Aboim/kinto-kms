use rand::Rng;
use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContractRecord {
    pub plate: String,
    pub start_date: String,
    pub duration: i64,
    pub limit_km: i64,
    pub max_limit_km: i64,
    pub cost_per_km: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MileageRecord {
    pub id: String,
    pub plate: String,
    pub date: String,
    pub kms: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContractHistoryEntry {
    pub plate: String,
    pub start_date: String,
    pub duration: i64,
    pub limit_km: i64,
    pub max_limit_km: i64,
    pub cost_per_km: f64,
    pub renewed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveContractRequest {
    pub old_plate: Option<String>,
    pub plate: String,
    #[serde(rename = "startDate")]
    pub start_date: String,
    pub duration: i64,
    pub limit: i64,
    #[serde(rename = "maxLimit")]
    pub max_limit: i64,
    #[serde(rename = "costPerKm")]
    pub cost_per_km: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveMileageRequest {
    pub id: String,
    pub plate: String,
    pub date: String,
    pub kms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateMileageRequest {
    pub date: String,
    pub kms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub uptime: f64,
}

pub struct ApiKeyManager {
    #[allow(dead_code)]
    key_file: PathBuf,
    api_key: String,
}

impl ApiKeyManager {
    pub fn new(key_file: PathBuf) -> Self {
        let api_key = if key_file.exists() {
            fs::read_to_string(&key_file).unwrap_or_default().trim().to_string()
        } else {
            let key: String = rand::thread_rng()
                .sample_iter(&rand::distributions::Alphanumeric)
                .take(64)
                .map(char::from)
                .collect();
            let _ = fs::write(&key_file, &key);
            key
        };
        ApiKeyManager { key_file, api_key }
    }

    pub fn api_key(&self) -> &str {
        &self.api_key
    }
}

pub fn get_app_db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&path).ok();
    path.push("kinto_kms.db");
    path
}

pub fn init_database(path: &PathBuf) -> rusqlite::Connection {
    let conn = rusqlite::Connection::open(path).expect("Failed to open database");
    conn.execute_batch("PRAGMA foreign_keys = ON;").ok();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS contracts (
            plate TEXT PRIMARY KEY,
            start_date TEXT NOT NULL,
            duration INTEGER NOT NULL,
            limit_km INTEGER NOT NULL,
            max_limit_km INTEGER NOT NULL,
            cost_per_km REAL NOT NULL
        );"
    ).ok();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mileage (
            id TEXT PRIMARY KEY,
            plate TEXT NOT NULL,
            date TEXT NOT NULL,
            kms REAL NOT NULL,
            FOREIGN KEY(plate) REFERENCES contracts(plate) ON DELETE CASCADE
        );"
    ).ok();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS contract_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate TEXT NOT NULL,
            start_date TEXT NOT NULL,
            duration INTEGER NOT NULL,
            limit_km INTEGER NOT NULL,
            max_limit_km INTEGER NOT NULL,
            cost_per_km REAL NOT NULL,
            renewed_at TEXT NOT NULL
        );"
    ).ok();
    conn
}
