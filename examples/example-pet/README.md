# Geometric Placeholder Pet Pack

An original geometric pixel-art placeholder pet pack designed to demonstrate and test the `codex-pet-companion` animation engine.

## Metadata
- **Pet ID**: `geometric-placeholder`
- **Display Name**: Geometric Placeholder
- **Description**: An original geometric pixel-art placeholder pet for testing the companion animation engine.
- **License**: CC0 1.0 Universal (Public Domain Dedication). See `LICENSE` for details.

## Asset Architecture
- **Master Spritesheet**: `spritesheet.png`
  - Dimensions: 1536x1872 pixels
  - Configuration: 8 columns x 9 rows
  - Grid cell size: 192x208 pixels
  - Alpha channel: Enabled (transparency)
- **Individual Enhancements Frames**: 16 frames total, all sized exactly 96x96 pixels with alpha channel transparency.
  - **Enter Clip** (`frames/enter/`): `diamond-1.png` to `diamond-4.png` (4 frames)
  - **Rest Clip** (`frames/rest/`): `circle-1.png` to `circle-8.png` (8 frames)
  - **Exit Clip** (`frames/exit/`): `diamond-4.png` to `diamond-1.png` (4 frames, reverse of enter)
