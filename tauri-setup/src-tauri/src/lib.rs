mod commands;
mod state;

use commands::database;
use commands::excel;
use commands::ocr;
use commands::pdf;
use state::*;

use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn get_contracts(state: tauri::State<'_, AppState>) -> Result<Vec<ContractRecord>, String> {
    database::get_all_contracts(&state.db)
}

#[tauri::command]
fn get_contract(state: tauri::State<'_, AppState>, plate: String) -> Result<Option<ContractRecord>, String> {
    database::get_contract(&state.db, &plate)
}

#[tauri::command]
fn save_contract(state: tauri::State<'_, AppState>, request: SaveContractRequest) -> Result<(), String> {
    database::save_contract(&state.db, &request)
}

#[tauri::command]
fn delete_contract(state: tauri::State<'_, AppState>, plate: String) -> Result<(), String> {
    database::delete_contract(&state.db, &plate)
}

#[tauri::command]
fn get_mileage(
    state: tauri::State<'_, AppState>,
    plate: String,
) -> Result<Vec<MileageRecord>, String> {
    database::get_mileage_by_plate(&state.db, &plate)
}

#[tauri::command]
fn get_all_mileage(state: tauri::State<'_, AppState>) -> Result<Vec<MileageRecord>, String> {
    database::get_all_mileage(&state.db)
}

#[tauri::command]
fn save_mileage(
    state: tauri::State<'_, AppState>,
    request: SaveMileageRequest,
) -> Result<(), String> {
    database::save_mileage(&state.db, &request)
}

#[tauri::command]
fn update_mileage(
    state: tauri::State<'_, AppState>,
    id: String,
    request: UpdateMileageRequest,
) -> Result<(), String> {
    database::update_mileage(&state.db, &id, &request)
}

#[tauri::command]
fn delete_mileage(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    database::delete_mileage(&state.db, &id)
}

#[tauri::command]
fn clear_mileage(state: tauri::State<'_, AppState>, plate: String) -> Result<(), String> {
    database::delete_mileage_by_plate(&state.db, &plate)
}

#[tauri::command]
fn get_contract_history(
    state: tauri::State<'_, AppState>,
    plate: String,
) -> Result<Vec<ContractHistoryEntry>, String> {
    database::get_contract_history(&state.db, &plate)
}

#[tauri::command]
fn save_contract_history(
    state: tauri::State<'_, AppState>,
    entry: ContractHistoryEntry,
) -> Result<(), String> {
    database::save_contract_history(&state.db, &entry)
}

#[tauri::command]
fn import_contracts_json(
    state: tauri::State<'_, AppState>,
    contracts: Vec<serde_json::Value>,
) -> Result<(), String> {
    database::import_contracts(&state.db, &contracts)
}

#[tauri::command]
fn import_mileage_json(
    state: tauri::State<'_, AppState>,
    mileage: Vec<serde_json::Value>,
) -> Result<(), String> {
    database::import_mileage(&state.db, &mileage)
}

#[tauri::command]
fn ocr_process(image_b64: String) -> Result<String, String> {
    let raw_text = ocr::ocr_from_base64(&image_b64)?;
    if raw_text.is_empty() {
        let preprocessed = ocr::preprocess_image_for_ocr(&image_b64)?;
        ocr::ocr_from_base64(&preprocessed)
    } else {
        Ok(raw_text)
    }
}

#[tauri::command]
fn generate_pdf(
    state: tauri::State<'_, AppState>,
    plate: String,
) -> Result<String, String> {
    let records = database::get_mileage_by_plate(&state.db, &plate)?;

    let mut pdf_dir = state
        .app_handle
        .path()
        .desktop_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap());
    let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    pdf_dir.push(format!("relatorio_{}_{}.pdf", plate, date_str));

    let path_str = pdf_dir.to_string_lossy().to_string();
    pdf::generate_pdf_report(&path_str, &plate, &records)?;
    Ok(path_str)
}

#[tauri::command]
fn generate_excel(
    state: tauri::State<'_, AppState>,
    plate: String,
) -> Result<String, String> {
    let records = database::get_mileage_by_plate(&state.db, &plate)?;

    let mut excel_dir = state
        .app_handle
        .path()
        .desktop_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap());
    let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    excel_dir.push(format!("relatorio_{}_{}.xlsx", plate, date_str));

    let path_str = excel_dir.to_string_lossy().to_string();
    excel::generate_excel_report(&path_str, &plate, &records)?;
    Ok(path_str)
}

#[tauri::command]
fn get_api_key(state: tauri::State<'_, AppState>) -> String {
    state.api_key_manager.api_key().to_string()
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn write_file(file_path: String, data: String) -> Result<(), String> {
    std::fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn get_server_port() -> i32 {
    3001
}

#[tauri::command]
fn health_check() -> HealthResponse {
    HealthResponse {
        status: "ok".to_string(),
        uptime: 0.0,
    }
}

#[tauri::command]
fn import_excel_file(
    state: tauri::State<'_, AppState>,
    file_path: String,
    plate: String,
) -> Result<Vec<MileageRecord>, String> {
    let mut records = excel::read_excel_file(&file_path)?;
    for rec in &mut records {
        rec.plate = plate.clone();
        database::save_mileage(
            &state.db,
            &SaveMileageRequest {
                id: rec.id.clone(),
                plate: rec.plate.clone(),
                date: rec.date.clone(),
                kms: rec.kms,
            },
        )
        .ok();
    }
    Ok(records)
}

#[tauri::command]
fn get_app_data_dir(app_handle: tauri::AppHandle) -> String {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub api_key_manager: ApiKeyManager,
    pub app_handle: tauri::AppHandle,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let db_path = get_app_db_path(&app_handle);
            let db = init_database(&db_path);

            let mut key_path = app_handle
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            key_path.push(".api-key");
            let api_key_manager = ApiKeyManager::new(key_path);

            app.manage(AppState {
                db: Mutex::new(db),
                api_key_manager,
                app_handle,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_contracts,
            get_contract,
            save_contract,
            delete_contract,
            get_mileage,
            get_all_mileage,
            save_mileage,
            update_mileage,
            delete_mileage,
            clear_mileage,
            get_contract_history,
            save_contract_history,
            import_contracts_json,
            import_mileage_json,
            ocr_process,
            generate_pdf,
            generate_excel,
            get_api_key,
            read_file,
            write_file,
            get_server_port,
            health_check,
            import_excel_file,
            get_app_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
