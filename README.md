# YouTube to Obsidian

YouTubeの動画字幕を取得し、タイムスタンプ付きの文字起こしノートを自動でObsidianに保存するGoogle Chrome拡張機能です。

## 機能

- YouTubeの字幕（自動生成・手動字幕）からタイムスタンプ付きの文字起こしを取得
- 複数のObsidian保管庫（Vault）を登録・切り替え可能
- 保管庫内の保存先ディレクトリを自由に指定（ネストパス対応: `Notes/YouTube/Transcripts` など）
- 動画タイトル・チャンネル名・URLをメタデータとしてFrontmatterに記録
- 日本語字幕を優先表示
- 保存先パスのリアルタイムプレビュー

**生成されるノート例:**

```markdown
---
title: "動画タイトル"
url: "https://www.youtube.com/watch?v=xxxx"
channel: "チャンネル名"
date: 2024-01-01
tags:
  - youtube
  - transcript
---

# 動画タイトル

| 項目 | 内容 |
|------|------|
| URL | [YouTube](https://www.youtube.com/watch?v=xxxx) |
| チャンネル | チャンネル名 |
| 動画時間 | 12:34 |

## 文字起こし

[0:05] テキスト内容...
[0:12] 次のテキスト...
```

## 必要なもの

- Google Chrome
- [Obsidian](https://obsidian.md/)
- Obsidianプラグイン: [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)

## インストール

### 1. Obsidian Local REST API プラグインをセットアップ

1. Obsidianを開く
2. **設定 → コミュニティプラグイン** → セーフモードをオフ
3. 「Local REST API」を検索してインストール・有効化
4. プラグイン設定を開き、**API Key** をコピーしておく（ポートはデフォルトで `27123`）

### 2. Chrome拡張機能を読み込む

> [!NOTE]
> 現在はChromeウェブストア未公開のため、デベロッパーモードで手動インストールします。

1. このリポジトリをクローンまたはZIPでダウンロード
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidianYoutubeClip.git
   ```
2. Chromeで `chrome://extensions/` を開く
3. 右上の **「デベロッパーモード」** をオン
4. **「パッケージ化されていない拡張機能を読み込む」** をクリック
5. クローンしたフォルダ（`obsidianYoutubeClip`）を選択

## 設定

1. 拡張機能アイコンをクリックしてポップアップを開く
2. **「⚙ 保管庫の管理」** を展開
3. **「＋ 保管庫を追加」** をクリック
4. 以下を入力して「保存」

   | 項目 | 説明 |
   |------|------|
   | 名前 | 保管庫を識別する任意の名前 |
   | ポート番号 | Local REST APIのポート（デフォルト: `27123`） |
   | デフォルトフォルダ | ノートの保存先（例: `YouTube`、`Notes/YouTube`） |
   | APIキー | プラグイン設定でコピーしたキー |

複数のObsidianインスタンスを使っている場合は、それぞれ別のポートで設定することで複数の保管庫を管理できます。

## 使い方

1. YouTubeの動画ページ（`youtube.com/watch?v=...`）を開く
2. 拡張機能アイコンをクリック
3. **保管庫** と **ディレクトリ** を確認・変更（パスプレビューで保存先を確認できます）
4. **字幕言語** を選択（日本語字幕が優先表示）
5. **「Obsidianに保存」** をクリック

## 注意事項

- 字幕のない動画には対応していません（自動生成字幕がある動画は対応）
- Obsidianが起動していない状態では保存できません
- Local REST API プラグインが有効になっている必要があります
- APIキーはブラウザのローカルストレージにのみ保存されます（外部送信なし）

## 開発

### セットアップ

```bash
git clone https://github.com/YOUR_USERNAME/obsidianYoutubeClip.git
cd obsidianYoutubeClip
npm install
```

### テスト

```bash
# テストを実行
npm test

# ウォッチモード（ファイル変更を監視して自動実行）
npm run test:watch

# カバレッジレポートを生成
npm run test:coverage
```

テストは `src/utils.js` の純粋関数（Chrome API・DOM非依存）を対象とします。
現在 **50テストケース** が含まれています。

| テスト対象 | 説明 |
|------|------|
| `parseTranscriptJson3` | JSON3形式の字幕パース |
| `formatTimestamp` / `formatDuration` | 秒数のフォーマット変換 |
| `sanitizeFileName` | ファイル名の無効文字除去・長さ制限 |
| `buildVaultUrl` | Obsidian APIエンドポイントURL生成 |
| `buildNoteContent` | Markdownノートのテンプレート生成 |
| `sortCaptionsByLanguage` | 字幕の優先言語ソート |
| `buildPathHint` | 保存先パスのプレビュー文字列生成 |
| `generateId` | ユニークID生成 |

## ファイル構成

```
obsidianYoutubeClip/
├── manifest.json              # Chrome拡張機能の設定（Manifest V3）
├── src/
│   └── utils.js               # 純粋関数（テスト可能なビジネスロジック）
├── content/
│   └── content.js             # YouTubeページから動画情報・字幕URLを取得
├── background/
│   └── service-worker.js      # 字幕データの取得・パース・Obsidian APIへの保存
├── popup/
│   ├── popup.html             # ポップアップUI
│   ├── popup.js               # ポップアップのロジック
│   └── popup.css              # スタイル
└── tests/
    └── utils.test.js          # Jestテスト（50ケース）
```

## ライセンス

MIT License
