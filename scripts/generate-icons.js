"use strict";

/**
 * 追加パッケージ不要のPNGアイコンジェネレーター（Node.js標準モジュールのみ使用）
 * 生成: icons/icon16.png, icons/icon48.png, icons/icon128.png
 */

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ---- PNG エンコーダー ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
}

/**
 * @param {number} size
 * @param {(x: number, y: number, size: number) => [number,number,number,number]} pixelFn RGBA
 */
function createPNG(size, pixelFn) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // color type 6 = RGBA
  const ihdr = pngChunk(
    "IHDR",
    Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])])
  );

  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // filter: None
    for (let x = 0; x < size; x++) rows.push(...pixelFn(x, y, size));
  }

  return Buffer.concat([
    PNG_SIG,
    ihdr,
    pngChunk("IDAT", zlib.deflateSync(Buffer.from(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- アイコンのデザイン ----

function lerp(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

/**
 * 角丸矩形の内部判定（Signed Distance Field）
 */
function inRoundedRect(px, py, cx, cy, halfW, halfH, r) {
  const dx = Math.max(0, Math.abs(px - cx) - (halfW - r));
  const dy = Math.max(0, Math.abs(py - cy) - (halfH - r));
  return dx * dx + dy * dy <= r * r;
}

/**
 * アイコンのピクセル色を返す
 * デザイン: ダーク背景 + YouTube赤(#f38ba8)→Obsidian紫(#cba6f7)のグラデーション角丸矩形
 */
function iconPixel(x, y, size) {
  const PAD = Math.max(1, Math.round(size * 0.09));
  const R = Math.max(2, Math.round(size * 0.22));
  const BG = [0x1e, 0x1e, 0x2e, 255];

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const halfW = (size - 2 * PAD) / 2;
  const halfH = (size - 2 * PAD) / 2;

  if (!inRoundedRect(x, y, cx, cy, halfW, halfH, R)) return BG;

  // グラデーション: 左=YouTube赤 → 右=Obsidian紫
  const t = (x - PAD) / Math.max(1, size - 2 * PAD - 1);
  return [lerp(0xf3, 0xcb, t), lerp(0x8b, 0xa6, t), lerp(0xa8, 0xf7, t), 255];
}

// ---- ファイル生成 ----

const ICONS_DIR = path.join(__dirname, "..", "icons");
fs.mkdirSync(ICONS_DIR, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createPNG(size, iconPixel);
  const dest = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`✓ icons/icon${size}.png  (${png.length} bytes)`);
}

console.log("\nアイコン生成完了！");
