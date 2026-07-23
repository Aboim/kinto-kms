use printpdf::*;
use std::fs::File;
use std::io::BufWriter;

use super::super::state::MileageRecord;

pub fn generate_pdf_report(
    file_path: &str,
    plate: &str,
    records: &[MileageRecord],
) -> Result<(), String> {
    let (doc, page_idx, layer_idx) =
        PdfDocument::new("KINTO KMS Report", Mm(297.0), Mm(210.0), "Layer 1");

    let current_layer = doc.get_page(page_idx).get_layer(layer_idx);

    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    let title = format!("Relatorio KINTO - {}", plate);
    current_layer.use_text(&title, 16.0, Mm(14.0), Mm(15.0), &font);

    let today = chrono::Local::now().format("%d/%m/%Y").to_string();
    current_layer.use_text(
        &format!("Gerado em: {}", today),
        8.0,
        Mm(14.0),
        Mm(22.0),
        &font,
    );

    let mut y_pos = 30.0_f64;

    current_layer.use_text("DATA", 7.0, Mm(14.0), Mm(y_pos as f32), &font);
    current_layer.use_text("KMs", 7.0, Mm(42.0), Mm(y_pos as f32), &font);
    current_layer.use_text("Diferenca", 7.0, Mm(62.0), Mm(y_pos as f32), &font);
    current_layer.use_text("Dias", 7.0, Mm(82.0), Mm(y_pos as f32), &font);
    current_layer.use_text("KM/Dia", 7.0, Mm(98.0), Mm(y_pos as f32), &font);

    let current_layer = doc.get_page(page_idx).get_layer(layer_idx);

    let mut sorted: Vec<_> = records.iter().collect();
    sorted.sort_by(|a, b| a.date.cmp(&b.date));

    y_pos += 5.0;

    for rec in &sorted {
        if y_pos > 280.0 {
            break;
        }
        current_layer.use_text(&rec.date, 7.0, Mm(14.0), Mm(y_pos as f32), &font);
        current_layer.use_text(
            &format!("{:.0}", rec.kms),
            7.0,
            Mm(42.0),
            Mm(y_pos as f32),
            &font,
        );
        y_pos += 5.0;
    }

    let file = File::create(file_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer).map_err(|e| e.to_string())?;

    Ok(())
}
