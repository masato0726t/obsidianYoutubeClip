// src/utils.js が popup.html で事前に読み込まれていることを前提とする
// 利用する関数: generateId, sortCaptionsByLanguage, buildPathHint

let videoInfo = null;
let vaults = [];
let editingVaultId = null;

// ---- ステータス表示 ----

function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status ${type}`;
  el.classList.remove("hidden");
}

function hideStatus(elementId) {
  document.getElementById(elementId).classList.add("hidden");
}

// ---- ストレージ ----

async function loadVaults() {
  const data = await chrome.storage.local.get(["vaults", "selectedVaultId"]);
  vaults = data.vaults || [];
  return data.selectedVaultId || null;
}

async function persistVaults(selectedVaultId) {
  await chrome.storage.local.set({ vaults, selectedVaultId });
}

// ---- 保管庫セレクター（メイン画面） ----

function renderVaultSelect(selectedVaultId) {
  const select = document.getElementById("vault-select");
  select.innerHTML = "";

  if (vaults.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "保管庫が未設定です（下の設定から追加）";
    select.appendChild(opt);
    return;
  }

  for (const vault of vaults) {
    const opt = document.createElement("option");
    opt.value = vault.id;
    opt.textContent = vault.name;
    if (vault.id === selectedVaultId) opt.selected = true;
    select.appendChild(opt);
  }
}

function getSelectedVault() {
  const id = document.getElementById("vault-select").value;
  return vaults.find((v) => v.id === id) || null;
}

function updatePathHint() {
  const vault = getSelectedVault();
  const folder = document.getElementById("folder-input").value.trim();
  const hint = document.getElementById("path-hint");
  hint.textContent = vault ? buildPathHint(vault.name, folder) : "";
}

// ---- 保管庫リスト（設定画面） ----

function renderVaultList(selectedVaultId) {
  const listEl = document.getElementById("vault-list");
  listEl.innerHTML = "";

  if (vaults.length === 0) {
    const empty = document.createElement("div");
    empty.className = "vault-list-empty";
    empty.textContent = "保管庫が登録されていません";
    listEl.appendChild(empty);
    return;
  }

  for (const vault of vaults) {
    const item = document.createElement("div");
    item.className = "vault-item" + (vault.id === selectedVaultId ? " selected" : "");

    const info = document.createElement("div");
    info.className = "vault-item-info";
    info.innerHTML = `
      <span class="vault-item-name">${vault.name}</span>
      <span class="vault-item-meta">ポート: ${vault.port}　フォルダ: ${vault.defaultFolder || "（ルート）"}</span>
    `;

    const editBtn = document.createElement("button");
    editBtn.className = "vault-item-edit";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => openVaultForm(vault.id));

    item.appendChild(info);
    item.appendChild(editBtn);
    listEl.appendChild(item);
  }
}

// ---- 保管庫フォーム ----

function openVaultForm(vaultId) {
  editingVaultId = vaultId || null;
  document.getElementById("vault-form").classList.remove("hidden");
  document.getElementById("add-vault-btn").classList.add("hidden");
  hideStatus("vault-form-status");

  if (vaultId) {
    const vault = vaults.find((v) => v.id === vaultId);
    document.getElementById("vault-form-title").textContent = "保管庫を編集";
    document.getElementById("vf-name").value = vault.name;
    document.getElementById("vf-port").value = vault.port;
    document.getElementById("vf-default-folder").value = vault.defaultFolder || "";
    document.getElementById("vf-api-key").value = vault.apiKey;
    document.getElementById("vf-delete-btn").classList.remove("hidden");
  } else {
    document.getElementById("vault-form-title").textContent = "新しい保管庫";
    document.getElementById("vf-name").value = "";
    document.getElementById("vf-port").value = "27123";
    document.getElementById("vf-default-folder").value = "YouTube";
    document.getElementById("vf-api-key").value = "";
    document.getElementById("vf-delete-btn").classList.add("hidden");
  }
}

function closeVaultForm() {
  document.getElementById("vault-form").classList.add("hidden");
  document.getElementById("add-vault-btn").classList.remove("hidden");
  editingVaultId = null;
}

// ---- 初期化 ----

async function initPopup() {
  const selectedVaultId = await loadVaults();

  renderVaultSelect(selectedVaultId);
  renderVaultList(selectedVaultId);

  const activeVault = vaults.find((v) => v.id === selectedVaultId);
  if (activeVault) {
    document.getElementById("folder-input").value = activeVault.defaultFolder || "";
  }
  updatePathHint();

  document.getElementById("vault-select").addEventListener("change", () => {
    const vault = getSelectedVault();
    if (vault) document.getElementById("folder-input").value = vault.defaultFolder || "";
    updatePathHint();
  });
  document.getElementById("folder-input").addEventListener("input", updatePathHint);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById("loading").classList.add("hidden");

  if (!tab.url?.includes("youtube.com/watch")) {
    document.getElementById("not-youtube").classList.remove("hidden");
  } else {
    await initVideoInfo(tab);
  }

  document.getElementById("add-vault-btn").addEventListener("click", () => openVaultForm(null));
  document.getElementById("vf-cancel-btn").addEventListener("click", closeVaultForm);
  document.getElementById("vf-save-btn").addEventListener("click", handleVaultSave);
  document.getElementById("vf-delete-btn").addEventListener("click", handleVaultDelete);
  document.getElementById("save-btn").addEventListener("click", handleSave);
}

// content script の分離ワールド問題を回避するため、
// ページの main world に直接アクセスして ytInitialPlayerResponse を取得する。
// この関数はシリアライズされてページ内で実行されるため、外部スコープを参照してはならない。
function _extractVideoInfoFromPage() {
  try {
    const data = window.ytInitialPlayerResponse;
    if (!data?.videoDetails) return null;
    const vd = data.videoDetails;
    const tracks =
      data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    return {
      title: vd.title,
      videoId: vd.videoId,
      channelTitle: vd.author,
      lengthSeconds: parseInt(vd.lengthSeconds) || 0,
      captionTracks: tracks.map((t) => ({
        languageCode: t.languageCode,
        name: t.name?.simpleText || t.languageCode,
        baseUrl: t.baseUrl,
        isAsr: t.kind === "asr",
      })),
    };
  } catch {
    return null;
  }
}

async function initVideoInfo(tab) {
  let execResult;
  try {
    [execResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: _extractVideoInfoFromPage,
    });
  } catch (err) {
    showStatus("status", `スクリプトの実行に失敗しました: ${err.message}`, "error");
    document.getElementById("video-info").classList.remove("hidden");
    return;
  }

  videoInfo = execResult?.result ?? null;

  if (!videoInfo) {
    showStatus(
      "status",
      "動画情報を取得できませんでした。ページが完全に読み込まれてから再試行してください。",
      "error"
    );
    document.getElementById("video-info").classList.remove("hidden");
    return;
  }

  document.getElementById("video-title").textContent = videoInfo.title;
  document.getElementById("channel-name").textContent = videoInfo.channelTitle;
  updatePathHint();

  const captionSelect = document.getElementById("caption-select");
  const saveBtn = document.getElementById("save-btn");

  if (videoInfo.captionTracks.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "字幕なし（この動画は文字起こしできません）";
    captionSelect.appendChild(opt);
    saveBtn.disabled = true;
  } else {
    for (const track of sortCaptionsByLanguage(videoInfo.captionTracks)) {
      const opt = document.createElement("option");
      opt.value = track.baseUrl;
      opt.textContent = track.name || track.languageCode;
      captionSelect.appendChild(opt);
    }
  }

  document.getElementById("video-info").classList.remove("hidden");
}

// ---- 保管庫の保存・削除 ----

async function handleVaultSave() {
  const name = document.getElementById("vf-name").value.trim();
  const port = parseInt(document.getElementById("vf-port").value) || 27123;
  const defaultFolder = document.getElementById("vf-default-folder").value.trim();
  const apiKey = document.getElementById("vf-api-key").value.trim();

  if (!name) {
    showStatus("vault-form-status", "名前を入力してください", "error");
    return;
  }
  if (!apiKey) {
    showStatus("vault-form-status", "APIキーを入力してください", "error");
    return;
  }

  let selectedVaultId = document.getElementById("vault-select").value;

  if (editingVaultId) {
    const vault = vaults.find((v) => v.id === editingVaultId);
    Object.assign(vault, { name, port, defaultFolder, apiKey });
  } else {
    const newVault = { id: generateId(), name, port, defaultFolder, apiKey };
    vaults.push(newVault);
    if (vaults.length === 1) selectedVaultId = newVault.id;
  }

  await persistVaults(selectedVaultId);
  renderVaultSelect(selectedVaultId);
  renderVaultList(selectedVaultId);
  closeVaultForm();
}

async function handleVaultDelete() {
  if (!editingVaultId) return;

  const currentSelected = document.getElementById("vault-select").value;
  vaults = vaults.filter((v) => v.id !== editingVaultId);

  const newSelected =
    currentSelected === editingVaultId ? (vaults[0]?.id || null) : currentSelected;

  await persistVaults(newSelected);
  renderVaultSelect(newSelected);
  renderVaultList(newSelected);

  const nextVault = vaults.find((v) => v.id === newSelected);
  if (nextVault) document.getElementById("folder-input").value = nextVault.defaultFolder || "";
  updatePathHint();
  closeVaultForm();
}

// ---- 字幕フェッチ（YouTubeページの MAIN world で実行） ----
// 外部スコープを参照してはならない（executeScript でシリアライズされるため）。
//
// 戦略1: get_transcript Inner Tube API（Transcript パネルと同じ正規API）
//   - ytcfg から APIキー・VisitorData・ClientVersion を取得してリクエスト
//   - credentials:'include' でクッキーを付与
// 戦略2: XHR で timedtext URL を複数パターン試行
// 戦略3: ウォッチページHTMLから新鮮な字幕URLを取得して再試行
function _fetchCaptionTextFromPage(captionUrl, videoId, languageCode, isAsr) {

  // ---- Inner Tube get_transcript ----
  function fetchViaInnerTube() {
    const cfg = (window.ytcfg && window.ytcfg.data_) || {};
    const apiKey      = cfg.INNERTUBE_API_KEY || "";
    const visitorData = cfg.VISITOR_DATA || "";
    const clientVer   = cfg.INNERTUBE_CLIENT_VERSION || "2.20240930.00.00";

    // protobuf: outer{field1: inner{field1: videoId}, field2: ""}
    const vBytes = videoId.split("").map(function(c) { return c.charCodeAt(0); });
    const inner  = [0x0a, vBytes.length].concat(vBytes);
    const outer  = [0x0a, inner.length].concat(inner).concat([0x12, 0x00]);
    const params = btoa(String.fromCharCode.apply(null, outer));

    const headers = { "Content-Type": "application/json" };
    if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;

    const path = "/youtubei/v1/get_transcript" + (apiKey ? "?key=" + apiKey : "");

    return fetch("https://www.youtube.com" + path, {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: clientVer, hl: languageCode || "ja", gl: "JP" } },
        params: params
      })
    }).then(function(res) {
      return res.ok ? res.json() : null;
    }).then(function(data) {
      if (!data) return null;
      const segs = (
        data.actions && data.actions[0] &&
        data.actions[0].updateEngagementPanelAction &&
        data.actions[0].updateEngagementPanelAction.content &&
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer &&
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer.content &&
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer.content.transcriptSearchPanelRenderer &&
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body &&
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer &&
        data.actions[0].updateEngagementPanelAction.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer.initialSegments
      ) || [];
      if (!segs.length) return null;
      const lines = [];
      for (let i = 0; i < segs.length; i++) {
        const r = segs[i] && segs[i].transcriptSegmentRenderer;
        if (!r) continue;
        const secs = Math.floor((parseInt(r.startMs) || 0) / 1000);
        const time = Math.floor(secs / 60) + ":" + ("0" + (secs % 60)).slice(-2);
        const runs = (r.snippet && r.snippet.runs) || [];
        const text = runs.map(function(x) { return x.text || ""; }).join("").replace(/\n/g, " ").trim();
        if (text) lines.push("[" + time + "] " + text);
      }
      return lines.length ? lines.join("\n") : null;
    }).catch(function() { return null; });
  }

  // ---- XHR ヘルパー ----
  function xhrGet(url) {
    return new Promise(function(resolve) {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = 10000;
      xhr.onload  = function() { resolve(this.status === 200 ? (this.responseText || "") : ""); };
      xhr.onerror = xhr.ontimeout = function() { resolve(""); };
      xhr.send();
    });
  }

  function norm(u) { return u.startsWith("//") ? "https:" + u : u; }
  const base = norm(captionUrl);
  const kind = isAsr ? "&kind=asr" : "";
  let withFmt = base;
  try { const u = new URL(base); u.searchParams.set("fmt", "json3"); withFmt = u.toString(); } catch(_) {}

  const candidates = [
    withFmt, base,
    "https://www.youtube.com/api/timedtext?v=" + videoId + "&lang=" + languageCode + kind + "&fmt=json3",
    "https://www.youtube.com/api/timedtext?v=" + videoId + "&lang=" + languageCode + kind,
  ];

  function tryXhr(i) {
    if (i >= candidates.length) return tryHtmlFallback();
    return xhrGet(candidates[i]).then(function(text) {
      return (text && text.trim()) ? { text: text } : tryXhr(i + 1);
    });
  }

  function tryHtmlFallback() {
    return xhrGet("https://www.youtube.com/watch?v=" + videoId + "&hl=ja").then(function(html) {
      if (!html) return { error: "字幕データを取得できませんでした" };
      const m = html.match(/"captionTracks":(\[.*?\]),"audioTracks"/);
      if (!m) return { error: "ページ内に字幕情報が見つかりませんでした" };
      let tracks;
      try { tracks = JSON.parse(m[1]); } catch(_) { return { error: "字幕データの解析に失敗しました" }; }
      const track =
        tracks.find(function(t) { return t.languageCode === languageCode && (!isAsr || t.kind === "asr"); }) ||
        tracks.find(function(t) { return t.languageCode === languageCode; }) ||
        tracks[0];
      if (!track || !track.baseUrl) return { error: "字幕トラックが見つかりませんでした" };
      let freshUrl = norm(track.baseUrl);
      try { const u = new URL(freshUrl); u.searchParams.set("fmt", "json3"); freshUrl = u.toString(); } catch(_) {}
      return xhrGet(freshUrl).then(function(t) {
        if (t && t.trim()) return { text: t };
        return xhrGet(norm(track.baseUrl)).then(function(t2) {
          return (t2 && t2.trim()) ? { text: t2 } : { error: "字幕データを取得できませんでした" };
        });
      });
    });
  }

  // Inner Tube → XHR → HTML の順で試みる
  return fetchViaInnerTube().then(function(text) {
    return text ? { text: text } : tryXhr(0);
  });
}

// ---- Obsidianへ保存 ----

async function handleSave() {
  const vault = getSelectedVault();
  const captionUrl = document.getElementById("caption-select").value;
  const folder = document.getElementById("folder-input").value.trim();

  if (!vault) {
    document.getElementById("vault-settings").setAttribute("open", "");
    showStatus("status", "保管庫を設定してください（下の「保管庫の管理」から追加）", "error");
    return;
  }

  if (!captionUrl) {
    showStatus("status", "この動画に字幕がないため文字起こしできません", "error");
    return;
  }

  await persistVaults(vault.id);

  const saveBtn = document.getElementById("save-btn");
  const saveBtnText = document.getElementById("save-btn-text");
  saveBtn.disabled = true;
  saveBtnText.textContent = "保存中...";
  hideStatus("status");
  showStatus("status", "字幕データを取得中...", "info");

  try {
    // 1. YouTubeページのコンテキスト（Cookie付き）で字幕テキストを取得
    //    ASR（自動生成）含む複数URLパターンを試みる
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const selectedTrack = videoInfo.captionTracks.find((t) => t.baseUrl === captionUrl);
    const [fetchExec] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: _fetchCaptionTextFromPage,
      args: [
        captionUrl,
        videoInfo.videoId,
        selectedTrack?.languageCode ?? "",
        selectedTrack?.isAsr ?? false,
      ],
    });

    const fetchResult = fetchExec?.result;
    if (!fetchResult || fetchResult.error) {
      showStatus("status", fetchResult?.error || "字幕の取得に失敗しました", "error");
      return;
    }

    const rawText = fetchResult.text ?? "";
    if (!rawText.trim()) {
      showStatus("status", "字幕データが空でした。この動画の字幕は取得できません。", "error");
      return;
    }

    // 2. JSON3 → XML フォールバックでパース（utils.js の関数を使用）
    let transcript;
    if (rawText.trimStart().startsWith("{")) {
      try {
        transcript = parseTranscriptJson3(JSON.parse(rawText));
      } catch {
        transcript = parseTranscriptXml(rawText);
      }
    } else {
      transcript = parseTranscriptXml(rawText);
    }

    if (!transcript) {
      showStatus("status", "字幕データを解析できませんでした。", "error");
      return;
    }

    showStatus("status", "Obsidianに保存中...", "info");

    // 3. Service Worker 経由で Obsidian に保存（パース済みテキストを渡す）
    const result = await chrome.runtime.sendMessage({
      action: "saveToObsidian",
      videoInfo,
      transcript,
      folder,
      apiKey: vault.apiKey,
      port: vault.port,
    });

    if (result?.success) {
      showStatus("status", `${vault.name} に保存完了: ${result.fileName}`, "success");
    } else {
      showStatus("status", result?.error || "不明なエラーが発生しました", "error");
    }
  } catch (err) {
    showStatus("status", err.message || "予期しないエラーが発生しました", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtnText.textContent = "Obsidianに保存";
  }
}

document.addEventListener("DOMContentLoaded", initPopup);
