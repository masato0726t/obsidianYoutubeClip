importScripts("../src/utils.js");

// 字幕フェッチはpopup.jsのexecuteScript(world:'MAIN')が担当するため
// ここではパース済みのtranscriptテキストを受け取りObsidianに保存するだけ

async function saveToObsidian({ videoInfo, transcript, folder, apiKey, port }) {
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
