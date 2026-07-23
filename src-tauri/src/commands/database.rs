use rusqlite::params;
use serde_json::Value;
use std::sync::Mutex;

use super::super::state::*;

pub fn get_all_contracts(conn: &Mutex<rusqlite::Connection>) -> Result<Vec<ContractRecord>, String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT plate, start_date, duration, limit_km, max_limit_km, cost_per_km FROM contracts")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ContractRecord {
                plate: row.get(0)?,
                start_date: row.get(1)?,
                duration: row.get(2)?,
                limit_km: row.get(3)?,
                max_limit_km: row.get(4)?,
                cost_per_km: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut contracts = Vec::new();
    for row in rows {
        contracts.push(row.map_err(|e| e.to_string())?);
    }
    Ok(contracts)
}

pub fn get_contract(conn: &Mutex<rusqlite::Connection>, plate: &str) -> Result<Option<ContractRecord>, String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT plate, start_date, duration, limit_km, max_limit_km, cost_per_km FROM contracts WHERE plate = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![plate], |row| {
            Ok(ContractRecord {
                plate: row.get(0)?,
                start_date: row.get(1)?,
                duration: row.get(2)?,
                limit_km: row.get(3)?,
                max_limit_km: row.get(4)?,
                cost_per_km: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(Ok(record)) => Ok(Some(record)),
        Some(Err(e)) => Err(e.to_string()),
        None => Ok(None),
    }
}

pub fn save_contract(conn: &Mutex<rusqlite::Connection>, req: &SaveContractRequest) -> Result<(), String> {
    if req.plate.is_empty()
        || req.start_date.is_empty()
        || req.duration <= 0
        || req.limit <= 0
        || req.max_limit <= 0
    {
        return Err("Dados invalidos. Verifique os campos e certifique-se que sao numeros.".into());
    }

    let db = conn.lock().map_err(|e| e.to_string())?;

    if let Some(ref old_plate) = req.old_plate {
        if old_plate != &req.plate {
            db.execute_batch("PRAGMA foreign_keys = OFF;").map_err(|e| e.to_string())?;

            let exists: bool = db
                .query_row(
                    "SELECT COUNT(*) FROM contracts WHERE plate = ?1",
                    params![req.plate],
                    |row| row.get::<_, i64>(0),
                )
                .map(|c| c > 0)
                .map_err(|e| e.to_string())?;

            if exists {
                db.execute(
                    "UPDATE mileage SET plate = ?1 WHERE plate = ?2",
                    params![req.plate, old_plate],
                )
                .map_err(|e| e.to_string())?;
                db.execute("DELETE FROM contracts WHERE plate = ?1", params![old_plate])
                    .map_err(|e| e.to_string())?;
                db.execute(
                    "UPDATE contracts SET start_date = ?1, duration = ?2, limit_km = ?3, max_limit_km = ?4, cost_per_km = ?5 WHERE plate = ?6",
                    params![
                        req.start_date,
                        req.duration,
                        req.limit,
                        req.max_limit,
                        req.cost_per_km,
                        req.plate
                    ],
                )
                .map_err(|e| e.to_string())?;
            } else {
                db.execute(
                    "UPDATE contracts SET plate = ?1, start_date = ?2, duration = ?3, limit_km = ?4, max_limit_km = ?5, cost_per_km = ?6 WHERE plate = ?7",
                    params![
                        req.plate,
                        req.start_date,
                        req.duration,
                        req.limit,
                        req.max_limit,
                        req.cost_per_km,
                        old_plate
                    ],
                )
                .map_err(|e| e.to_string())?;
                db.execute(
                    "UPDATE mileage SET plate = ?1 WHERE plate = ?2",
                    params![req.plate, old_plate],
                )
                .map_err(|e| e.to_string())?;
            }

            db.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    db.execute(
        "INSERT INTO contracts (plate, start_date, duration, limit_km, max_limit_km, cost_per_km)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(plate) DO UPDATE SET
           start_date = excluded.start_date,
           duration = excluded.duration,
           limit_km = excluded.limit_km,
           max_limit_km = excluded.max_limit_km,
           cost_per_km = excluded.cost_per_km",
        params![
            req.plate,
            req.start_date,
            req.duration,
            req.limit,
            req.max_limit,
            req.cost_per_km
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_contract(conn: &Mutex<rusqlite::Connection>, plate: &str) -> Result<(), String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM contracts WHERE plate = ?1", params![plate])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_mileage_by_plate(
    conn: &Mutex<rusqlite::Connection>,
    plate: &str,
) -> Result<Vec<MileageRecord>, String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, plate, date, kms FROM mileage WHERE plate = ?1 ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![plate], |row| {
            Ok(MileageRecord {
                id: row.get(0)?,
                plate: row.get(1)?,
                date: row.get(2)?,
                kms: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| e.to_string())?);
    }
    Ok(records)
}

pub fn get_all_mileage(conn: &Mutex<rusqlite::Connection>) -> Result<Vec<MileageRecord>, String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, plate, date, kms FROM mileage ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MileageRecord {
                id: row.get(0)?,
                plate: row.get(1)?,
                date: row.get(2)?,
                kms: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| e.to_string())?);
    }
    Ok(records)
}

pub fn save_mileage(conn: &Mutex<rusqlite::Connection>, req: &SaveMileageRequest) -> Result<(), String> {
    if req.id.is_empty() || req.plate.is_empty() || req.date.is_empty() || req.kms < 0.0 {
        return Err("Dados invalidos. A data e os KMS sao obrigatorios e devem ser positivos.".into());
    }
    let db = conn.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO mileage (id, plate, date, kms) VALUES (?1, ?2, ?3, ?4)",
        params![req.id, req.plate, req.date, req.kms],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_mileage(
    conn: &Mutex<rusqlite::Connection>,
    id: &str,
    req: &UpdateMileageRequest,
) -> Result<(), String> {
    if req.date.is_empty() || req.kms < 0.0 {
        return Err("Dados invalidos. A data e os KMS sao obrigatorios e devem ser positivos.".into());
    }
    let db = conn.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE mileage SET date = ?1, kms = ?2 WHERE id = ?3",
        params![req.date, req.kms, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_mileage(conn: &Mutex<rusqlite::Connection>, id: &str) -> Result<(), String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM mileage WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_mileage_by_plate(
    conn: &Mutex<rusqlite::Connection>,
    plate: &str,
) -> Result<(), String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM mileage WHERE plate = ?1", params![plate])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_contract_history(
    conn: &Mutex<rusqlite::Connection>,
    plate: &str,
) -> Result<Vec<ContractHistoryEntry>, String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT plate, start_date, duration, limit_km, max_limit_km, cost_per_km, renewed_at \
             FROM contract_history WHERE plate = ?1 ORDER BY renewed_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![plate], |row| {
            Ok(ContractHistoryEntry {
                plate: row.get(0)?,
                start_date: row.get(1)?,
                duration: row.get(2)?,
                limit_km: row.get(3)?,
                max_limit_km: row.get(4)?,
                cost_per_km: row.get(5)?,
                renewed_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut history = Vec::new();
    for row in rows {
        history.push(row.map_err(|e| e.to_string())?);
    }
    Ok(history)
}

pub fn save_contract_history(
    conn: &Mutex<rusqlite::Connection>,
    entry: &ContractHistoryEntry,
) -> Result<(), String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO contract_history (plate, start_date, duration, limit_km, max_limit_km, cost_per_km, renewed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.plate,
            entry.start_date,
            entry.duration,
            entry.limit_km,
            entry.max_limit_km,
            entry.cost_per_km,
            entry.renewed_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_contracts(
    conn: &Mutex<rusqlite::Connection>,
    contracts: &[Value],
) -> Result<(), String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    for c in contracts {
        let plate = c["plate"].as_str().unwrap_or("");
        let start_date = c["start_date"].as_str().unwrap_or("");
        let duration = c["duration"].as_i64().unwrap_or(60);
        let limit_km = c["limit_km"].as_i64().unwrap_or(50000);
        let max_limit_km = c["max_limit_km"].as_i64().unwrap_or(65000);
        let cost_per_km = c["cost_per_km"].as_f64().unwrap_or(0.069);

        let exists: bool = db
            .query_row(
                "SELECT COUNT(*) FROM contracts WHERE plate = ?1",
                params![plate],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .map_err(|e| e.to_string())?;

        if !exists {
            db.execute(
                "INSERT INTO contracts (plate, start_date, duration, limit_km, max_limit_km, cost_per_km) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![plate, start_date, duration, limit_km, max_limit_km, cost_per_km],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn import_mileage(
    conn: &Mutex<rusqlite::Connection>,
    mileage: &[Value],
) -> Result<(), String> {
    let db = conn.lock().map_err(|e| e.to_string())?;
    for m in mileage {
        let id = m["id"].as_str().unwrap_or("");
        let plate = m["plate"].as_str().unwrap_or("");
        let date = m["date"].as_str().unwrap_or("");
        let kms_value = &m["kms"];
        let kms: f64 = if kms_value.is_number() {
            kms_value.as_f64().unwrap_or(0.0)
        } else {
            kms_value.as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0)
        };

        let exists: bool = db
            .query_row(
                "SELECT COUNT(*) FROM mileage WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .map_err(|e| e.to_string())?;

        if !exists && !id.is_empty() && !plate.is_empty() {
            db.execute(
                "INSERT INTO mileage (id, plate, date, kms) VALUES (?1, ?2, ?3, ?4)",
                params![id, plate, date, kms],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
