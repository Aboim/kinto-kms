# Icons placeholder

Run `npm run tauri:icon -- "path/to/icon.png"` or `cargo tauri icon "path/to/icon.png"` to generate all necessary icon files from a 1024x1024 PNG source image.

The generator will create:
  - 32x32.png
  - 128x128.png
  - 128x128@2x.png
  - icon.icns (macOS)
  - icon.ico (Windows)

For now, use the existing `public/favicon.svg` or create a custom 1024x1024 PNG.
