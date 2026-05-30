"use strict";

const { ZipArchive } = require("archiver");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const outDir = path.join(ROOT, "dist");
const outFile = path.join(outDir, `youtube-to-obsidian-v${version}.zip`);

// 拡張機能に必要なファイルのみを含める（node_modules, tests, scripts等は除外）
const ENTRIES = [
  { type: "file", name: "manifest.json" },
  { type: "dir",  name: "icons" },
  { type: "dir",  name: "src" },
  { type: "dir",  name: "content" },
  { type: "dir",  name: "background" },
  { type: "dir",  name: "popup" },
];

fs.mkdirSync(outDir, { recursive: true });

const output = fs.createWriteStream(outFile);
const archive = new ZipArchive({ zlib: { level: 9 } });

archive.on("error", (err) => { throw err; });

archive.on("entry", (entry) => {
  console.log(`  + ${entry.name}`);
});

output.on("close", () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  const rel = path.relative(ROOT, outFile).replace(/\\/g, "/");
  console.log(`\n✓ ${rel}  (${kb} KB)`);
  console.log("\nChromeへの導入方法:");
  console.log("  1. ZIPを任意のフォルダに展開");
  console.log("  2. chrome://extensions/ を開く");
  console.log("  3. デベロッパーモードをオン");
  console.log("  4. 「パッケージ化されていない拡張機能を読み込む」→ 展開したフォルダを選択");
});

archive.pipe(output);

for (const entry of ENTRIES) {
  const src = path.join(ROOT, entry.name);
  if (!fs.existsSync(src)) {
    console.warn(`  ! スキップ (存在しない): ${entry.name}`);
    continue;
  }
  if (entry.type === "file") {
    archive.file(src, { name: entry.name });
  } else {
    archive.directory(src, entry.name);
  }
}

archive.finalize();
