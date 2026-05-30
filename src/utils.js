/**
 * YouTube json3形式の字幕データをタイムスタンプ付きテキストに変換する
 * @param {{ events?: Array<{ tStartMs?: number, segs?: Array<{ utf8?: string }> }> }} data
 * @returns {string}
 */
function parseTranscriptJson3(data) {
  const lines = [];

  for (const event of data.events || []) {
    if (!event.segs) continue;

    const text = event.segs
      .map((seg) => seg.utf8 || "")
      .join("")
      .replace(/\n/g, " ")
      .trim();

    if (!text) continue;

    const totalSeconds = Math.floor((event.tStartMs || 0) / 1000);
    lines.push(`[${formatTimestamp(totalSeconds)}] ${text}`);
  }

  return lines.join("\n");
}

/**
 * 秒数を "m:ss" または "h:mm:ss" 形式のタイムスタンプに変換する
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 秒数を "m:ss" または "h:mm:ss" 形式の動画時間に変換する
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  return formatTimestamp(totalSeconds);
}

/**
 * ファイル名として使用できない文字を "-" に置換し、100文字に切り詰める
 * @param {string} title
 * @returns {string}
 */
function sanitizeFileName(title) {
  return title.replace(/[\\/:*?"<>|]/g, "-").substring(0, 100).trim();
}

/**
 * Obsidian Local REST API のエンドポイントURLを構築する
 * @param {number} port
 * @param {string} folder  スラッシュ区切りの保存先パス（空文字可）
 * @param {string} fileName
 * @returns {string}
 */
function buildVaultUrl(port, folder, fileName) {
  const segments = folder
    ? folder.split("/").filter(Boolean).map(encodeURIComponent)
    : [];
  segments.push(encodeURIComponent(fileName));
  return `http://127.0.0.1:${port}/vault/${segments.join("/")}`;
}

/**
 * ObsidianノートのMarkdownを生成する
 * @param {{ title: string, videoId: string, channelTitle: string, lengthSeconds: number }} videoInfo
 * @param {string} transcript
 * @param {string} [date]  YYYY-MM-DD形式（省略時は今日の日付）
 * @returns {string}
 */
function buildNoteContent(videoInfo, transcript, date) {
  const noteDate = date ?? new Date().toISOString().split("T")[0];
  const videoUrl = `https://www.youtube.com/watch?v=${videoInfo.videoId}`;
  const duration = formatDuration(videoInfo.lengthSeconds);
  const escapedTitle = videoInfo.title.replace(/"/g, '\\"');

  return `---
title: "${escapedTitle}"
url: "${videoUrl}"
channel: "${videoInfo.channelTitle}"
date: ${noteDate}
tags:
  - youtube
  - transcript
---

# ${videoInfo.title}

| 項目 | 内容 |
|------|------|
| URL | [YouTube](${videoUrl}) |
| チャンネル | ${videoInfo.channelTitle} |
| 動画時間 | ${duration} |
| 保存日 | ${noteDate} |

## 文字起こし

${transcript}
`;
}

/**
 * YouTube XML形式の字幕テキストをタイムスタンプ付きテキストに変換する（json3フォールバック用）
 * @param {string} xmlText
 * @returns {string}
 */
function parseTranscriptXml(xmlText) {
  const lines = [];
  const regex = /<text[^>]+start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const start = parseFloat(match[1]);
    const text = match[2]
      .replace(/<[^>]*>/g, "")   // タグ除去を先に行いエンティティを守る
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    lines.push(`[${formatTimestamp(Math.floor(start))}] ${text}`);
  }
  return lines.join("\n");
}

/**
 * 字幕トラックを優先言語が先頭になるようにソートする（元の配列を変更しない）
 * @param {Array<{ languageCode: string, name: string, baseUrl: string }>} tracks
 * @param {string} [preferredLang]
 * @returns {Array}
 */
function sortCaptionsByLanguage(tracks, preferredLang = "ja") {
  return [...tracks].sort((a, b) => {
    if (a.languageCode === preferredLang) return -1;
    if (b.languageCode === preferredLang) return 1;
    return 0;
  });
}

/**
 * 保存先パスのヒント文字列を生成する
 * @param {string} vaultName
 * @param {string} folder
 * @returns {string}
 */
function buildPathHint(vaultName, folder) {
  const parts = [vaultName];
  if (folder) parts.push(...folder.split("/").filter(Boolean));
  parts.push("動画タイトル.md");
  return parts.join(" / ");
}

/**
 * タイムスタンプとランダム値を組み合わせた一意のIDを生成する
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Node.js (Jest) 向けエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseTranscriptJson3,
    parseTranscriptXml,
    formatTimestamp,
    formatDuration,
    sanitizeFileName,
    buildVaultUrl,
    buildNoteContent,
    sortCaptionsByLanguage,
    buildPathHint,
    generateId,
  };
}
