use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::GenericImageView;
use leptess::LepTess;

pub fn ocr_from_base64(image_b64: &str) -> Result<String, String> {
    let image_data = BASE64
        .decode(image_b64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let img = image::load_from_memory(&image_data)
        .map_err(|e| format!("Failed to load image: {}", e))?;

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("kinto_ocr_{}.png", std::process::id()));
    img.save(&temp_path)
        .map_err(|e| format!("Failed to save temp image: {}", e))?;

    let mut lt = LepTess::new(None, "eng")
        .map_err(|e| format!("Failed to init Tesseract: {}. Is Tesseract OCR installed? Install from https://github.com/UB-Mannheim/tesseract/wiki", e))?;

    lt.set_image_from_file(&temp_path)
        .map_err(|e| format!("Failed to set image: {}", e))?;

    let text = lt.get_utf8_text()
        .map_err(|e| format!("Failed to OCR: {}", e))?;

    let _ = std::fs::remove_file(&temp_path);

    let numbers: String = text.chars().filter(|c| c.is_ascii_digit()).collect();

    if numbers.is_empty() || numbers.parse::<u64>().unwrap_or(0) == 0 {
        Ok(String::new())
    } else {
        Ok(numbers)
    }
}

pub fn preprocess_image_for_ocr(image_b64: &str) -> Result<String, String> {
    let image_data = BASE64
        .decode(image_b64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut img = image::load_from_memory(&image_data)
        .map_err(|e| format!("Failed to load image: {}", e))?;

    let gray = img.grayscale();
    img = image::DynamicImage::ImageLuma8(gray);

    let (width, height) = img.dimensions();
    let threshold: u8 = 120;
    let mut processed = image::GrayImage::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let pixel = img.get_pixel(x, y);
            let value = pixel[0];
            processed.put_pixel(x, y, image::Luma([if value > threshold { 255 } else { 0 }]));
        }
    }

    let mut buf = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageLuma8(processed)
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode preprocessed image: {}", e))?;

    Ok(BASE64.encode(buf.into_inner()))
}
