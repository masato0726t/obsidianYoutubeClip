importScripts("../src/utils.js");

async function fetchTranscript(captionBaseUrl) {
  // プロトコル相対URL (//) を https: に正規化する
  const rawUrl = captionBaseUrl.startsWith("//")
    ? `https:${captionBaseUrl}`
    : captionBaseUrl;

  const url = new URL(rawUrl);
  url.searchParams.set("fmt", "json3");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`字幕の取得に失敗しました (HTTP ${response.status})`);
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error("字幕データが空でした。この動画の字幕は取得できない可能性があります。");
  }

  // JSON3形式を試みる
  if (text.trimStart().startsWith("{")) {
    try {
      return parseTranscriptJson3(JSON.parse(text));
    } catch {
      // JSON パース失敗 → XML フォールバックへ
    }
  }

  // XML形式にフォールバック
  const xmlResult = parseTranscriptXml(text);
  if (xmlResult) return xmlResult;

  throw new Error(
    "字幕データを解析できませんでした。字幕の形式が対応していない可能性があります。"
  );
}

async function saveToObsidian({ videoInfo, selectedCaptionUrl, folder, apiKey, port }) {
  const transcript = await fetchTranscript(selectedCaptionUrl);
  const noteContent = buildNoteContent(videoInfo, transcript);
  const fileName = `${sanitizeFileName(videoInfo.title)}.md`;
  const vaultUrl = buildVaultUrl(port, folder, fileName);

  const response = await fetch(vaultUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "text/markdown",
      Authorization: `Bearer ${apiKey}`,
    },
    body: noteContent,
  });

  if (response.status === 401) {
    throw new Error("APIキーが正しくありません");
  }
  if (response.status === 404) {
    throw new Error("Obsidianが起動していないか、Local REST APIプラグインが無効です");
  }
  if (!response.ok) {
    throw new Error(`Obsidianへの保存に失敗しました (HTTP ${response.status})`);
  }

  return { success: true, fileName };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "saveToObsidian") {
    saveToObsidian(request)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});
