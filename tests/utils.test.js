"use strict";

const {
  parseTranscriptJson3,
  formatTimestamp,
  formatDuration,
  sanitizeFileName,
  buildVaultUrl,
  buildNoteContent,
  sortCaptionsByLanguage,
  buildPathHint,
  generateId,
} = require("../src/utils.js");

// ============================================================
// parseTranscriptJson3
// ============================================================
describe("parseTranscriptJson3", () => {
  test("eventsが空配列の場合、空文字列を返す", () => {
    expect(parseTranscriptJson3({ events: [] })).toBe("");
  });

  test("eventsキーが存在しない場合、空文字列を返す", () => {
    expect(parseTranscriptJson3({})).toBe("");
  });

  test("segsを持たないイベント（書式制御用）はスキップされる", () => {
    const data = { events: [{ tStartMs: 0 }, { tStartMs: 1000, segs: [{ utf8: "Hello" }] }] };
    expect(parseTranscriptJson3(data)).toBe("[0:01] Hello");
  });

  test("空のテキストになるイベントはスキップされる", () => {
    const data = {
      events: [
        { tStartMs: 0, segs: [{ utf8: "  " }] },
        { tStartMs: 2000, segs: [{ utf8: "有効なテキスト" }] },
      ],
    };
    expect(parseTranscriptJson3(data)).toBe("[0:02] 有効なテキスト");
  });

  test("複数のsegsを結合して1行にする", () => {
    const data = {
      events: [{ tStartMs: 5000, segs: [{ utf8: "Hello" }, { utf8: " " }, { utf8: "World" }] }],
    };
    expect(parseTranscriptJson3(data)).toBe("[0:05] Hello World");
  });

  test("テキスト中の改行は半角スペースに置換される", () => {
    const data = { events: [{ tStartMs: 0, segs: [{ utf8: "line1\nline2" }] }] };
    expect(parseTranscriptJson3(data)).toBe("[0:00] line1 line2");
  });

  test("複数イベントは改行で結合される", () => {
    const data = {
      events: [
        { tStartMs: 0, segs: [{ utf8: "First" }] },
        { tStartMs: 5000, segs: [{ utf8: "Second" }] },
      ],
    };
    expect(parseTranscriptJson3(data)).toBe("[0:00] First\n[0:05] Second");
  });

  test("tStartMsが未定義の場合は0秒として扱う", () => {
    const data = { events: [{ segs: [{ utf8: "Test" }] }] };
    expect(parseTranscriptJson3(data)).toBe("[0:00] Test");
  });

  test("utf8が未定義のセグメントは空文字として扱う", () => {
    const data = { events: [{ tStartMs: 0, segs: [{ utf8: "Hello" }, {}] }] };
    expect(parseTranscriptJson3(data)).toBe("[0:00] Hello");
  });
});

// ============================================================
// formatTimestamp / formatDuration
// ============================================================
describe("formatTimestamp / formatDuration", () => {
  test("0秒 → '0:00'", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatDuration(0)).toBe("0:00");
  });

  test("45秒 → '0:45'", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  test("60秒 → '1:00'", () => {
    expect(formatDuration(60)).toBe("1:00");
  });

  test("90秒 → '1:30'", () => {
    expect(formatDuration(90)).toBe("1:30");
  });

  test("3600秒（1時間）→ '1:00:00'", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  test("3661秒 → '1:01:01'", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  test("7384秒 → '2:03:04'", () => {
    expect(formatDuration(7384)).toBe("2:03:04");
  });

  test("分・秒は常に2桁ゼロ埋め", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3601)).toBe("1:00:01");
  });
});

// ============================================================
// sanitizeFileName
// ============================================================
describe("sanitizeFileName", () => {
  test("安全なタイトルはそのまま返す", () => {
    expect(sanitizeFileName("My Video Title")).toBe("My Video Title");
  });

  test("禁止文字 \\ / : * ? \" < > | を '-' に置換する", () => {
    expect(sanitizeFileName('test\\/:*?"<>|title')).toBe("test---------title");
  });

  test("バックスラッシュを '-' に置換する", () => {
    expect(sanitizeFileName("path\\file")).toBe("path-file");
  });

  test("100文字を超えるタイトルを切り詰める", () => {
    const longTitle = "a".repeat(120);
    expect(sanitizeFileName(longTitle)).toHaveLength(100);
  });

  test("先頭・末尾のスペースをトリムする", () => {
    expect(sanitizeFileName("  hello  ")).toBe("hello");
  });

  test("日本語タイトルはそのまま返す", () => {
    expect(sanitizeFileName("JavaScriptの基礎講座")).toBe("JavaScriptの基礎講座");
  });
});

// ============================================================
// buildVaultUrl
// ============================================================
describe("buildVaultUrl", () => {
  test("フォルダなしの場合、ファイル名だけのパスになる", () => {
    expect(buildVaultUrl(27123, "", "Note.md")).toBe(
      "http://127.0.0.1:27123/vault/Note.md"
    );
  });

  test("フォルダを指定するとパスに含まれる", () => {
    expect(buildVaultUrl(27123, "YouTube", "Note.md")).toBe(
      "http://127.0.0.1:27123/vault/YouTube/Note.md"
    );
  });

  test("ネストしたフォルダパスに対応する", () => {
    expect(buildVaultUrl(27123, "Notes/YouTube/Transcripts", "Note.md")).toBe(
      "http://127.0.0.1:27123/vault/Notes/YouTube/Transcripts/Note.md"
    );
  });

  test("フォルダ名の特殊文字はURIエンコードされる", () => {
    const url = buildVaultUrl(27123, "My Vault/2024 Videos", "Note.md");
    expect(url).toBe(
      "http://127.0.0.1:27123/vault/My%20Vault/2024%20Videos/Note.md"
    );
  });

  test("ファイル名の特殊文字はURIエンコードされる", () => {
    const url = buildVaultUrl(27123, "YouTube", "Video Title (HD).md");
    expect(url).toBe(
      "http://127.0.0.1:27123/vault/YouTube/Video%20Title%20(HD).md"
    );
  });

  test("カスタムポートを使用できる", () => {
    expect(buildVaultUrl(27124, "YouTube", "Note.md")).toBe(
      "http://127.0.0.1:27124/vault/YouTube/Note.md"
    );
  });

  test("フォルダの前後のスラッシュは無視される", () => {
    expect(buildVaultUrl(27123, "/YouTube/", "Note.md")).toBe(
      "http://127.0.0.1:27123/vault/YouTube/Note.md"
    );
  });
});

// ============================================================
// buildNoteContent
// ============================================================
describe("buildNoteContent", () => {
  const videoInfo = {
    title: "テスト動画タイトル",
    videoId: "abc123",
    channelTitle: "テストチャンネル",
    lengthSeconds: 185,
  };
  const transcript = "[0:00] こんにちは\n[0:05] テストです";
  const date = "2024-01-15";

  test("YAMLフロントマターを含む", () => {
    const note = buildNoteContent(videoInfo, transcript, date);
    expect(note).toContain('title: "テスト動画タイトル"');
    expect(note).toContain('url: "https://www.youtube.com/watch?v=abc123"');
    expect(note).toContain('channel: "テストチャンネル"');
    expect(note).toContain("date: 2024-01-15");
    expect(note).toContain("- youtube");
    expect(note).toContain("- transcript");
  });

  test("動画タイトルをH1見出しとして含む", () => {
    const note = buildNoteContent(videoInfo, transcript, date);
    expect(note).toContain("# テスト動画タイトル");
  });

  test("チャンネル名・動画時間・保存日をテーブルに含む", () => {
    const note = buildNoteContent(videoInfo, transcript, date);
    expect(note).toContain("テストチャンネル");
    expect(note).toContain("3:05"); // 185秒
    expect(note).toContain("2024-01-15");
  });

  test("文字起こしセクションを含む", () => {
    const note = buildNoteContent(videoInfo, transcript, date);
    expect(note).toContain("## 文字起こし");
    expect(note).toContain("[0:00] こんにちは");
    expect(note).toContain("[0:05] テストです");
  });

  test("タイトル内のダブルクォートはエスケープされる", () => {
    const infoWithQuote = { ...videoInfo, title: 'Test "quoted" Title' };
    const note = buildNoteContent(infoWithQuote, transcript, date);
    expect(note).toContain('title: "Test \\"quoted\\" Title"');
  });

  test("dateを省略した場合、今日の日付が使われる", () => {
    const today = new Date().toISOString().split("T")[0];
    const note = buildNoteContent(videoInfo, transcript);
    expect(note).toContain(`date: ${today}`);
  });

  test("YouTubeのURLが正しく生成される", () => {
    const note = buildNoteContent(videoInfo, transcript, date);
    expect(note).toContain("https://www.youtube.com/watch?v=abc123");
  });
});

// ============================================================
// sortCaptionsByLanguage
// ============================================================
describe("sortCaptionsByLanguage", () => {
  const jaTrack = { languageCode: "ja", name: "日本語", baseUrl: "url_ja" };
  const enTrack = { languageCode: "en", name: "English", baseUrl: "url_en" };
  const koTrack = { languageCode: "ko", name: "한국어", baseUrl: "url_ko" };

  test("日本語字幕が先頭に移動する", () => {
    const result = sortCaptionsByLanguage([enTrack, jaTrack, koTrack]);
    expect(result[0].languageCode).toBe("ja");
  });

  test("日本語字幕がない場合、順序は変わらない", () => {
    const result = sortCaptionsByLanguage([enTrack, koTrack]);
    expect(result[0].languageCode).toBe("en");
    expect(result[1].languageCode).toBe("ko");
  });

  test("空配列を渡すと空配列を返す", () => {
    expect(sortCaptionsByLanguage([])).toEqual([]);
  });

  test("元の配列を変更しない（immutable）", () => {
    const original = [enTrack, jaTrack];
    const originalFirst = original[0].languageCode;
    sortCaptionsByLanguage(original);
    expect(original[0].languageCode).toBe(originalFirst);
  });

  test("preferredLangで優先言語を変更できる", () => {
    const result = sortCaptionsByLanguage([jaTrack, enTrack, koTrack], "ko");
    expect(result[0].languageCode).toBe("ko");
  });

  test("日本語字幕のみの場合もそのまま返す", () => {
    const result = sortCaptionsByLanguage([jaTrack]);
    expect(result).toHaveLength(1);
    expect(result[0].languageCode).toBe("ja");
  });
});

// ============================================================
// buildPathHint
// ============================================================
describe("buildPathHint", () => {
  test("フォルダなしの場合、保管庫名とファイル名だけになる", () => {
    expect(buildPathHint("MyVault", "")).toBe("MyVault / 動画タイトル.md");
  });

  test("フォルダありの場合、パスに含まれる", () => {
    expect(buildPathHint("MyVault", "YouTube")).toBe("MyVault / YouTube / 動画タイトル.md");
  });

  test("ネストしたフォルダに対応する", () => {
    expect(buildPathHint("MyVault", "Notes/YouTube")).toBe(
      "MyVault / Notes / YouTube / 動画タイトル.md"
    );
  });

  test("フォルダの前後の空スラッシュは無視される", () => {
    expect(buildPathHint("MyVault", "/YouTube/")).toBe("MyVault / YouTube / 動画タイトル.md");
  });
});

// ============================================================
// generateId
// ============================================================
describe("generateId", () => {
  test("文字列を返す", () => {
    expect(typeof generateId()).toBe("string");
  });

  test("空文字列ではない", () => {
    expect(generateId().length).toBeGreaterThan(0);
  });

  test("連続して呼び出すと異なるIDが生成される", () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    expect(ids.size).toBe(100);
  });
});
