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
// 診断情報を diag オブジェクトに蓄積し、全失敗時にエラーメッセージへ含める。
//
// timedtext API は近年 PoToken を要求し空ボディを返すため当てにできない。
// 戦略1: get_transcript Inner Tube API（SAPISIDHASH 認証付き）
// 戦略2: DOM 文字起こしパネル方式（PoToken・認証と無縁の本命フォールバック）
function _fetchCaptionTextFromPage(captionUrl, videoId, languageCode, isAsr) {
  var diag = {};

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function xhrPost(url, headers, bodyStr) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = 15000;
      Object.keys(headers).forEach(function (k) { xhr.setRequestHeader(k, headers[k]); });
      xhr.onload = function () { resolve({ s: this.status, t: this.responseText || "" }); };
      xhr.onerror = xhr.ontimeout = function () { resolve({ s: 0, t: "" }); };
      xhr.send(bodyStr);
    });
  }

  // SHA-1 を hex 文字列で返す（SAPISIDHASH 生成用）
  function sha1hex(str) {
    return crypto.subtle
      .digest("SHA-1", new TextEncoder().encode(str))
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
        return hex;
      });
  }

  // SAPISIDHASH 認証ヘッダーを生成（取得できなければ null）
  function buildAuthHeader() {
    var origin = "https://www.youtube.com";
    var cookies = document.cookie.split("; ");
    var sapisid = "";
    for (var ci = 0; ci < cookies.length; ci++) {
      var eq = cookies[ci].indexOf("=");
      var name = cookies[ci].slice(0, eq);
      var val = cookies[ci].slice(eq + 1);
      if (name === "SAPISID" || name === "__Secure-3PAPISID") {
        sapisid = val;
        if (name === "SAPISID") break; // SAPISID を優先
      }
    }
    if (!sapisid) { diag.sapisid = "none"; return Promise.resolve(null); }
    diag.sapisid = "ok";
    var ts = Math.floor(Date.now() / 1000);
    return sha1hex(ts + " " + sapisid + " " + origin).then(function (hash) {
      return { value: "SAPISIDHASH " + ts + "_" + hash, origin: origin };
    });
  }

  // ---- 戦略1: get_transcript Inner Tube API ----
  function step1_innerTube() {
    var cfg = (window.ytcfg && window.ytcfg.data_) || {};
    var apiKey     = cfg.INNERTUBE_API_KEY || "";
    var visitorData= cfg.VISITOR_DATA || "";
    var clientVer  = cfg.INNERTUBE_CLIENT_VERSION || "2.20240930.00.00";
    diag.cfg = !!(apiKey || visitorData);

    // ytInitialData の engagement panel から YouTube 自身が使う params を抽出
    var params = null;
    try {
      var panels = (window.ytInitialData && window.ytInitialData.engagementPanels) || [];
      for (var i = 0; i < panels.length; i++) {
        var sec = panels[i] && panels[i].engagementPanelSectionListRenderer;
        if (!sec) continue;
        var isTranscript =
          sec.targetId === "engagement-panel-searchable-transcript" ||
          (sec.panelIdentifier && sec.panelIdentifier.indexOf("transcript") !== -1);
        if (!isTranscript) continue;
        var cont = sec.content && sec.content.continuationItemRenderer;
        var ep   = cont && cont.continuationEndpoint && cont.continuationEndpoint.getTranscriptEndpoint;
        if (ep && ep.params) { params = ep.params; break; }
      }
    } catch (_) {}

    // params が取れなければ手動 protobuf エンコード
    if (!params) {
      var vb = videoId.split("").map(function (c) { return c.charCodeAt(0); });
      var inner = [0x0a, vb.length].concat(vb);
      var outer = [0x0a, inner.length].concat(inner).concat([0x12, 0x00]);
      params = btoa(String.fromCharCode.apply(null, outer));
      diag.params = "manual";
    } else {
      diag.params = "panel";
    }

    return buildAuthHeader().then(function (auth) {
      var headers = { "Content-Type": "application/json" };
      if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
      if (auth) {
        headers["Authorization"] = auth.value;
        headers["X-Origin"] = auth.origin;
      }
      if (visitorData) {
        headers["X-Youtube-Client-Name"] = "1";
        headers["X-Youtube-Client-Version"] = clientVer;
      }
      var path = "/youtubei/v1/get_transcript" + (apiKey ? "?key=" + apiKey : "");
      var client = { clientName: "WEB", clientVersion: clientVer, hl: languageCode || "ja", gl: "JP" };
      if (visitorData) client.visitorData = visitorData;
      var bodyStr = JSON.stringify({ context: { client: client }, params: params });

      return xhrPost("https://www.youtube.com" + path, headers, bodyStr).then(function (r) {
        diag.it = r.s + ":" + r.t.length;
        if (r.s !== 200 || !r.t) return null;
        try {
          var data = JSON.parse(r.t);
          var a = data.actions && data.actions[0] && data.actions[0].updateEngagementPanelAction;
          var c = a && a.content && a.content.transcriptRenderer && a.content.transcriptRenderer.content;
          var panel = c && c.transcriptSearchPanelRenderer;
          var listR = panel && panel.body && panel.body.transcriptSegmentListRenderer;
          var segs = (listR && listR.initialSegments) || [];
          diag.segs = segs.length;
          if (!segs.length) return null;
          var lines = [];
          for (var j = 0; j < segs.length; j++) {
            var seg = segs[j] && segs[j].transcriptSegmentRenderer;
            if (!seg) continue;
            var secs = Math.floor((parseInt(seg.startMs) || 0) / 1000);
            var time = Math.floor(secs / 60) + ":" + ("0" + (secs % 60)).slice(-2);
            var runs = (seg.snippet && seg.snippet.runs) || [];
            var txt  = runs.map(function (x) { return x.text || ""; }).join("").replace(/\n/g, " ").trim();
            if (txt) lines.push("[" + time + "] " + txt);
          }
          return lines.length ? lines.join("\n") : null;
        } catch (_) { return null; }
      });
    }).catch(function () { return null; });
  }

  // ---- 戦略2: DOM 文字起こしパネル方式（本命フォールバック） ----
  function readTranscriptSegments() {
    var nodes = document.querySelectorAll("ytd-transcript-segment-renderer");
    if (!nodes.length) return null;
    var lines = [];
    for (var i = 0; i < nodes.length; i++) {
      var tsEl = nodes[i].querySelector(".segment-timestamp");
      var txEl = nodes[i].querySelector(".segment-text") ||
                 nodes[i].querySelector("yt-formatted-string.segment-text");
      var time = tsEl ? tsEl.textContent.trim() : "";
      var txt  = txEl ? txEl.textContent.replace(/\s+/g, " ").trim() : "";
      if (txt) lines.push((time ? "[" + time + "] " : "") + txt);
    }
    return lines.length ? lines.join("\n") : null;
  }

  // 「文字起こしを表示」ボタンを優先順位付きで探す（誤クリック防止）
  function findTranscriptButton() {
    // 1. 説明欄の transcript セクション内のボタン（最も確実）
    var sectionBtn = document.querySelector(
      "ytd-video-description-transcript-section-renderer button, " +
      "ytd-video-description-transcript-section-renderer ytd-button-renderer"
    );
    if (sectionBtn) return sectionBtn;
    // 2. aria-label の厳密マッチ（ボタン要素に限定）
    var byAria = document.querySelector(
      'button[aria-label*="文字起こし"], button[aria-label*="ranscript"], ' +
      'ytd-button-renderer[aria-label*="文字起こし"], ytd-button-renderer[aria-label*="ranscript"]'
    );
    if (byAria) return byAria;
    // 3. テキストマッチ（ボタン系要素に限定、a要素は除外して誤クリック防止）
    var els = document.querySelectorAll("button, tp-yt-paper-button, ytd-button-renderer");
    for (var i = 0; i < els.length; i++) {
      var label = ((els[i].getAttribute && els[i].getAttribute("aria-label")) || "") + " " +
                  (els[i].textContent || "");
      if (/文字起こし|transcript/i.test(label)) return els[i];
    }
    return null;
  }

  // 説明欄を展開 → 待機 → 文字起こしボタンをクリック
  function openTranscriptPanel() {
    var expand = document.querySelector("#description #expand") ||
                 document.querySelector("tp-yt-paper-button#expand") ||
                 document.querySelector("#expand");
    if (expand) { try { expand.click(); } catch (_) {} }
    // 展開後に DOM が更新されるのを待ってからボタンを探す
    return delay(600).then(function () {
      var btn = findTranscriptButton();
      diag.dom = btn ? "clicked" : "no-button";
      if (btn) { try { btn.click(); } catch (_) {} }
      return !!btn;
    });
  }

  function step2_dom() {
    // 既にパネルが開いていれば即読み取り
    var immediate = readTranscriptSegments();
    if (immediate) { diag.dom = "preloaded"; return Promise.resolve(immediate); }

    return openTranscriptPanel().then(function () {
      // セグメント出現を最大 ~8 秒ポーリング（200ms × 40）
      function poll(attempt) {
        var text = readTranscriptSegments();
        if (text) { diag.domSegs = text.split("\n").length; return Promise.resolve(text); }
        if (attempt >= 40) return Promise.resolve(null);
        return delay(200).then(function () { return poll(attempt + 1); });
      }
      return poll(0);
    });
  }

  // ---- 戦略を順番に実行: API → DOM ----
  return step1_innerTube().then(function (text) {
    if (text) return { text: text };
    return step2_dom().then(function (text2) {
      if (text2) return { text: text2 };
      var parts = Object.keys(diag).map(function (k) { return k + "=" + diag[k]; });
      return { error: "字幕を取得できませんでした [" + parts.join(" ") + "]" };
    });
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
  showStatus("status", "字幕データを取得中...（数秒かかる場合があります）", "info");

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

    // 2. パース
    //    戦略1(API)/戦略2(DOM) は [m:ss] text 形式の完成テキストを返すためそのまま使う。
    //    生の JSON3/XML が来た場合のみ utils.js のパーサにかける。
    let transcript;
    const trimmed = rawText.trimStart();
    if (/^\[\d+:\d{2}/.test(trimmed)) {
      transcript = rawText;
    } else if (trimmed.startsWith("{")) {
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
