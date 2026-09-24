#!/usr/bin/env node
"use strict";

// generate-placeholder.js — generates an original geometric placeholder
// spritesheet and companion frame images for the example pet pack.
//
// Output: spritesheet.png (1536x1872, 8 cols x 9 rows, 192x208 cells)
//         frames/enter/diamond-*.png  (4 frames, 96x96 each)
//         frames/rest/circle-*.png    (8 frames, 96x96 each)
//         frames/exit/diamond-*.png   (4 frames, 96x96 each)
//
// The companion engine accepts PNG natively via macOS ImageIO.
// spritesheet.png is the canonical asset; conversion to WebP is optional.
//
// License: CC0 1.0 Universal — see LICENSE file.

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ---- Minimal PNG writer ----
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);
  const crcV = Buffer.alloc(4);
  crcV.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, typeB, data, crcV]);
}

function writePNG(filePath, width, height, pixels) {
  // pixels: flat Uint8Array RGBA, row-major, no filter byte
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Add filter byte 0 (None) before each row
  const rowBytes = width * 4;
  const filtered = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0;
    Buffer.from(pixels.subarray(y * rowBytes, (y + 1) * rowBytes)).copy(filtered, y * (rowBytes + 1) + 1);
  }

  const compressed = zlib.deflateSync(filtered);
  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", Buffer.alloc(0));

  fs.writeFileSync(filePath, Buffer.concat([sig, pngChunk("IHDR", ihdr), idat, iend]));
}

// ---- Geometry helpers ----
function setPixel(pixels, x, y, w, r, g, b, a) {
  if (x < 0 || x >= w) return;
  const idx = (y * w + x) * 4;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = a;
}

function fillCircle(pixels, cx, cy, r, w, color) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(pixels, cx + dx, cy + dy, w, ...color);
      }
    }
  }
}

function fillRect(pixels, x0, y0, x1, y1, w, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setPixel(pixels, x, y, w, ...color);
    }
  }
}

function fillDiamond(pixels, cx, cy, r, w, color) {
  for (let dy = -r; dy <= r; dy++) {
    const hw = r - Math.abs(dy);
    for (let dx = -hw; dx <= hw; dx++) {
      setPixel(pixels, cx + dx, cy + dy, w, ...color);
    }
  }
}

function fillTriangle(pixels, x0, y0, x1, y1, x2, y2, w, color) {
  const minX = Math.max(0, Math.min(x0, x1, x2));
  const maxX = Math.min(w - 1, Math.max(x0, x1, x2));
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(1872 - 1, Math.max(y0, y1, y2));
  function edge(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d0 = edge(x0, y0, x1, y1, x, y);
      const d1 = edge(x1, y1, x2, y2, x, y);
      const d2 = edge(x2, y2, x0, y0, x, y);
      const hasNeg = (d0 < 0) || (d1 < 0) || (d2 < 0);
      const hasPos = (d0 > 0) || (d1 > 0) || (d2 > 0);
      if (!(hasNeg && hasPos)) {
        setPixel(pixels, x, y, w, ...color);
      }
    }
  }
}

function fillX(pixels, cx, cy, size, w, color) {
  for (let i = -size; i <= size; i++) {
    setPixel(pixels, cx + i, cy + i, w, ...color);
    setPixel(pixels, cx - i, cy + i, w, ...color);
  }
}

function fillStar(pixels, cx, cy, r, w, color) {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const len = r;
    for (let t = 0; t <= len; t++) {
      const x = Math.round(cx + Math.cos(angle) * t);
      const y = Math.round(cy + Math.sin(angle) * t);
      setPixel(pixels, x, y, w, ...color);
    }
  }
}

// ---- Generate spritesheet ----
const CELL_W = 192;
const CELL_H = 208;
const COLS = 8;
const ROWS = 9;
const W = CELL_W * COLS;
const H = CELL_H * ROWS;

const pixels = new Uint8Array(W * H * 4);
for (let i = 0; i < pixels.length; i++) pixels[i] = 0; // transparent

const colors = {
  idle:       [100, 180, 255, 255],
  runningR:   [255, 180, 100, 255],
  runningL:   [255, 220, 100, 255],
  waving:     [180, 255, 100, 255],
  jumping:    [255, 140, 180, 255],
  failed:     [255, 100, 100, 255],
  waiting:    [180, 180, 255, 255],
  running:    [100, 255, 200, 255],
  review:     [255, 200, 255, 255],
};

function drawCell(row, col, drawFn, extra) {
  const cx = col * CELL_W + CELL_W / 2;
  const cy = row * CELL_H + CELL_H / 2;
  drawFn(pixels, cx, cy, W, extra);
}

// Row 0: idle — static circle
for (let c = 0; c < COLS; c++) {
  drawCell(0, c, (p, cx, cy, w) => {
    fillCircle(p, cx, cy, 60, w, colors.idle);
  });
}

// Row 1: running-right — diamond shifting right
for (let c = 0; c < COLS; c++) {
  drawCell(1, c, (p, cx, cy, w) => {
    const shift = Math.round((c / (COLS - 1)) * 50 - 25);
    fillDiamond(p, cx + shift, cy, 55, w, colors.runningR);
  });
}

// Row 2: running-left — diamond shifting left
for (let c = 0; c < COLS; c++) {
  drawCell(2, c, (p, cx, cy, w) => {
    const shift = Math.round((1 - c / (COLS - 1)) * 50 - 25);
    fillDiamond(p, cx + shift, cy, 55, w, colors.runningL);
  });
}

// Row 3: waving — triangle leaning
for (let c = 0; c < COLS; c++) {
  drawCell(3, c, (p, cx, cy, w) => {
    const lean = Math.round((c / (COLS - 1)) * 40 - 20);
    fillTriangle(p, cx + lean - 40, cy + 60, cx + lean + 40, cy + 60, cx + lean, cy - 60, w, colors.waving);
  });
}

// Row 4: jumping — square bouncing vertically
for (let c = 0; c < COLS; c++) {
  drawCell(4, c, (p, cx, cy, w) => {
    const bounce = Math.round(Math.sin((c / COLS) * Math.PI * 2) * 40);
    const s = 50;
    fillRect(p, cx - s, cy + bounce - s, cx + s, cy + bounce + s, w, colors.jumping);
  });
}

// Row 5: failed — X shape
for (let c = 0; c < COLS; c++) {
  drawCell(5, c, (p, cx, cy, w) => {
    const size = 45 + Math.round(Math.sin((c / COLS) * Math.PI) * 10);
    fillX(p, cx, cy, size, w, colors.failed);
  });
}

// Row 6: waiting — pulsing circle
for (let c = 0; c < COLS; c++) {
  drawCell(6, c, (p, cx, cy, w) => {
    const r = 40 + Math.round(Math.sin((c / COLS) * Math.PI * 2) * 20);
    fillCircle(p, cx, cy, r, w, colors.waiting);
  });
}

// Row 7: running — rectangle shifting
for (let c = 0; c < COLS; c++) {
  drawCell(7, c, (p, cx, cy, w) => {
    const shift = Math.round((c / (COLS - 1)) * 60 - 30);
    fillRect(p, cx + shift - 30, cy - 40, cx + shift + 30, cy + 40, w, colors.running);
  });
}

// Row 8: review — star/sparkle
for (let c = 0; c < COLS; c++) {
  drawCell(8, c, (p, cx, cy, w) => {
    const r = 40 + Math.round(Math.sin((c / COLS) * Math.PI * 4) * 15);
    fillStar(p, cx, cy, r, w, colors.review);
  });
}

const sheetDir = path.dirname(process.argv[1]);
writePNG(path.join(sheetDir, "spritesheet.png"), W, H, pixels);
console.log(`Generated spritesheet.png (${W}x${H})`);

// ---- Generate individual frame PNGs ----
const FRAME_W = 96;
const FRAME_H = 96;

function genFrame(filename, drawFn) {
  const fp = new Uint8Array(FRAME_W * FRAME_H * 4);
  for (let i = 0; i < fp.length; i++) fp[i] = 0;
  drawFn(fp, FRAME_W / 2, FRAME_H / 2);
  const outPath = path.join(sheetDir, filename);
  writePNG(outPath, FRAME_W, FRAME_H, fp);
  console.log(`Generated ${filename}`);
}

// Enter: diamond growing
for (let i = 0; i < 4; i++) {
  const r = 15 + i * 10;
  genFrame(`frames/enter/diamond-${i + 1}.png`, (p, cx, cy) => {
    fillDiamond(p, cx, cy, r, FRAME_W, colors.runningR);
  });
}

// Rest: circle morph series
const restColors = [
  [100, 180, 255],
  [120, 190, 240],
  [140, 200, 225],
  [160, 210, 210],
  [180, 220, 200],
  [200, 230, 190],
  [220, 240, 180],
  [240, 250, 170],
];
for (let i = 0; i < 8; i++) {
  genFrame(`frames/rest/circle-${i + 1}.png`, (p, cx, cy) => {
    const r = 35 + Math.round(Math.sin((i / 8) * Math.PI * 2) * 8);
    fillCircle(p, cx, cy, r, FRAME_W, [...restColors[i], 255]);
  });
}

// Exit: diamond shrinking (reverse of enter)
for (let i = 0; i < 4; i++) {
  const r = 45 - i * 10;
  genFrame(`frames/exit/diamond-${i + 1}.png`, (p, cx, cy) => {
    fillDiamond(p, cx, cy, r, FRAME_W, colors.runningR);
  });
}

console.log("\nDone. The companion engine reads PNG natively via macOS ImageIO.");
console.log("No WebP conversion is required.");
