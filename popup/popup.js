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

// ---- プレーヤー字幕収集方式（YouTubeページの MAIN world で実行） ----
// timedtext / get_transcript は PoToken・仕様変更で全滅のため、
// プレーヤー自身（PoToken 解決済み）に字幕を表示させ DOM から収集する。
// 外部スコープを参照してはならない（executeScript でシリアライズされるため）。
//
// 収集状態は window.__ytClip に保持し、popup 側から poll する2段構成。

// 収集を開始する（即 return。動画をミュート・最高速で裏再生し字幕を収集）
function _startCaptionCollection(languageCode) {
  try {
    var player = document.getElementById("movie_player");
    if (!player || typeof player.getCurrentTime !== "function") {
      return { error: "プレーヤーが見つかりません。動画ページを開いた状態で実行してください。" };
    }

    // 既存コレクタがあれば停止
    if (window.__ytClip) {
      try { window.__ytClip.observer && window.__ytClip.observer.disconnect(); } catch (e) {}
      try { clearInterval(window.__ytClip.interval); } catch (e) {}
    }

    var state = {
      lines: [],
      seen: {},
      done: false,
      orig: {
        time: player.getCurrentTime(),
        rate: player.getPlaybackRate ? player.getPlaybackRate() : 1,
        muted: player.isMuted ? player.isMuted() : false,
      },
      duration: player.getDuration ? player.getDuration() : 0,
    };
    window.__ytClip = state;

    // 字幕モジュールをロードして指定言語トラックを有効化
    try { player.loadModule && player.loadModule("captions"); } catch (e) {}
    try { player.setOption("captions", "reload", true); } catch (e) {}
    try { player.setOption("captions", "track", { languageCode: languageCode || "ja" }); } catch (e) {}

    // ミュート・先頭へ・最高速で再生
    try { player.mute && player.mute(); } catch (e) {}
    try { player.seekTo && player.seekTo(0, true); } catch (e) {}
    try {
      var rates = player.getAvailablePlaybackRates ? player.getAvailablePlaybackRates() : [1, 2];
      var maxRate = rates && rates.length ? rates[rates.length - 1] : 2;
      player.setPlaybackRate && player.setPlaybackRate(maxRate);
      state.rate = maxRate;
    } catch (e) {}
    try { player.playVideo && player.playVideo(); } catch (e) {}

    // 現在画面に出ている字幕テキストを取り込む（重複は無視）
    function capture() {
      var segs = document.querySelectorAll(".ytp-caption-segment");
      if (!segs.length) return;
      var text = "";
      for (var i = 0; i < segs.length; i++) text += segs[i].textContent;
      text = text.replace(/\s+/g, " ").trim();
      if (!text || state.seen[text]) return;
      state.seen[text] = true;
      var secs = Math.floor(player.getCurrentTime ? player.getCurrentTime() : 0);
      var time = Math.floor(secs / 60) + ":" + ("0" + (secs % 60)).slice(-2);
      state.lines.push("[" + time + "] " + text);
    }

    function finish() {
      if (state.done) return;
      state.done = true;
      try { clearInterval(state.interval); } catch (e) {}
      try { state.observer && state.observer.disconnect(); } catch (e) {}
      // 元の再生状態を復元
      try { player.pauseVideo && player.pauseVideo(); } catch (e) {}
      try { player.setPlaybackRate && player.setPlaybackRate(state.orig.rate); } catch (e) {}
      try { player.seekTo && player.seekTo(state.orig.time, true); } catch (e) {}
      try { if (!state.orig.muted && player.unMute) player.unMute(); } catch (e) {}
    }
    state.finish = finish;

    // 字幕コンテナの変化を監視（高速再生でも取りこぼしにくい）
    var container = document.querySelector(".ytp-caption-window-container") || player;
    state.observer = new MutationObserver(capture);
    try {
      state.observer.observe(container, { childList: true, subtree: true, characterData: true });
    } catch (e) {}

    // 250ms ごとにポーリング補完＋終端判定
    state.interval = setInterval(function () {
      capture();
      var cur = player.getCurrentTime ? player.getCurrentTime() : 0;
      var ended = player.getPlayerState ? player.getPlayerState() === 0 : false;
      if (ended || (state.duration && cur >= state.duration - 0.5)) finish();
    }, 250);

    return { started: true, duration: state.duration, rate: state.rate || 1 };
  } catch (e) {
    return { error: "収集開始に失敗しました: " + (e && e.message) };
  }
}

// 収集状態を取得する（popup から定期 poll）
function _pollCaptionCollection() {
  var s = window.__ytClip;
  if (!s) return { error: "収集が開始されていません" };
  var player = document.getElementById("movie_player");
  var cur = player && player.getCurrentTime ? player.getCurrentTime() : 0;
  return {
    done: s.done,
    count: s.lines.length,
    cur: cur,
    duration: s.duration,
    text: s.done ? s.lines.join("\n") : null,
  };
}

// 収集を強制終了し、現時点までの結果を返す（タイムアウト時など）
function _stopCaptionCollection() {
  var s = window.__ytClip;
  if (!s) return { text: "" };
  try { s.finish && s.finish(); } catch (e) {}
  return { text: s.lines.join("\n"), count: s.lines.length };
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
  showStatus("status", "字幕の収集を開始しています...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const selectedTrack = videoInfo.captionTracks.find((t) => t.baseUrl === captionUrl);
    const langCode = selectedTrack?.languageCode ?? "";

    // 1. プレーヤー字幕収集を開始（動画をミュート・高速で裏再生し字幕を収集）
    const [startExec] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: _startCaptionCollection,
      args: [langCode],
    });
    const startResult = startExec?.result;
    if (!startResult || startResult.error) {
      showStatus("status", startResult?.error || "字幕収集を開始できませんでした", "error");
      return;
    }

    // 2. 完了までポーリング（500ms間隔）。進捗を表示。
    //    タイムアウト = 想定再生時間（duration / rate）+ 余裕30秒。最低でも60秒。
    const rate = startResult.rate || 1;
    const duration = startResult.duration || 0;
    const timeoutMs = Math.max(60000, ((duration / Math.max(rate, 1)) + 30) * 1000);
    const startedAt = Date.now();

    let transcript = null;
    while (true) {
      await new Promise((r) => setTimeout(r, 500));
      const [pollExec] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: _pollCaptionCollection,
      });
      const poll = pollExec?.result;
      if (poll?.error) {
        showStatus("status", poll.error, "error");
        return;
      }

      if (poll?.done) {
        transcript = poll.text || "";
        break;
      }

      // 進捗表示
      const pct = duration ? Math.min(99, Math.floor((poll.cur / duration) * 100)) : 0;
      showStatus("status", `字幕を収集中... ${pct}%（${poll.count}件）`, "info");

      // タイムアウト → 強制停止して現時点までの結果を使う
      if (Date.now() - startedAt > timeoutMs) {
        const [stopExec] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: _stopCaptionCollection,
        });
        transcript = stopExec?.result?.text || "";
        break;
      }
    }

    if (!transcript || !transcript.trim()) {
      showStatus(
        "status",
        "字幕を収集できませんでした。この動画に字幕が無いか、字幕表示がブロックされています。",
        "error"
      );
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
