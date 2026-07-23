use rust_xlsxwriter::*;

use super::super::state::MileageRecord;

pub fn generate_excel_report(
    file_path: &str,
    plate: &str,
    records: &[MileageRecord],
) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();

    sheet
        .write_string(0, 0, "Data")
        .map_err(|e| e.to_string())?;
    sheet
        .write_string(0, 1, "KMs")
        .map_err(|e| e.to_string())?;
    sheet
        .write_string(0, 2, "Matricula")
        .map_err(|e| e.to_string())?;

    let header_format = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0x3B82F6))
        .set_font_color(Color::White);
    sheet
        .set_cell_format(0, 0, &header_format)
        .map_err(|e| e.to_string())?;
    sheet
        .set_cell_format(0, 1, &header_format)
        .map_err(|e| e.to_string())?;
    sheet
        .set_cell_format(0, 2, &header_format)
        .map_err(|e| e.to_string())?;

    sheet
        .set_column_width(0, 12)
        .map_err(|e| e.to_string())?;
    sheet
        .set_column_width(1, 12)
        .map_err(|e| e.to_string())?;
    sheet
        .set_column_width(2, 15)
        .map_err(|e| e.to_string())?;

    let mut sorted: Vec<_> = records.iter().collect();
    sorted.sort_by(|a, b| a.date.cmp(&b.date));

    for (i, rec) in sorted.iter().enumerate() {
        let row = (i + 1) as u32;
        sheet
            .write_string(row, 0, &rec.date)
            .map_err(|e| e.to_string())?;
        sheet
            .write_number(row, 1, rec.kms)
            .map_err(|e| e.to_string())?;
        sheet
            .write_string(row, 2, plate)
            .map_err(|e| e.to_string())?;
    }

    workbook.save(file_path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_excel_file(file_path: &str) -> Result<Vec<MileageRecord>, String> {
    use calamine::{open_workbook, Reader, Xlsx};

    let mut workbook: Xlsx<_> =
        open_workbook(file_path).map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() {
        return Err("No sheets found in Excel file".into());
    }

    let range = workbook
        .worksheet_range(&sheet_names[0])
        .map_err(|e| format!("Failed to read sheet: {}", e))?;

    let mut records = Vec::new();
    let mut rows = range.rows();

    let _header = rows.next();

    for row in rows {
        if row.len() >= 2 {
            let date = row[0].to_string();
            let kms_str = row[1].to_string().replace(',', ".");
            let kms: f64 = kms_str.parse().unwrap_or(0.0);
            let id = format!("xls_{}_{}", date, kms);
            records.push(MileageRecord {
                id,
                plate: String::new(),
                date,
                kms,
            });
        }
    }

    Ok(records)
}
