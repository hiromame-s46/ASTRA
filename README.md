# ASTRA

![ASTRA logo](assets/astra-logo.png)

**English version is [here](#english).**

**ASTRA** は **Adaptive Scalable Training Recognition Architecture** の略称です。

ASTRAは、小規模コミュニティやイベント運営、研究用データ整理などに使える、ブラウザベースの顔認識・学習データ管理OSSです。顔検出、顔descriptor抽出、候補照合をブラウザ上で行い、サーバーに推論処理やDBを持たせません。PHP側は設定、JSON保存、画像配信、権限確認、埋め込み用APIに集中します。

このプロジェクトの中心は、**ブラウザのみで動く顔認識パイプライン**です。face-api.jsで顔を検出してdescriptorを作り、`matcher.js` で候補を高速に並べ、JSON APIで学習データと設定を管理します。管理者はASTRA単体の画面を使うだけでなく、同一サーバー内の既存ページから `astra-api.php` と `astra-embed.js` を呼び出してASTRAの判定機能を埋め込めます。

## 主な特徴

- `matcher.js` によるブラウザ完結の高速顔照合
- サーバー推論・DB推論なしで動作
- 顔検出とdescriptor抽出はface-api.jsでブラウザ内実行
- 128次元descriptorを `Float32Array` に変換して軽量に比較
- 近すぎる重複descriptorを自動圧縮
- 人物ごとの代表descriptorプロトタイプを構築
- プロトタイプで候補を高速に絞り込み、上位候補だけ全descriptorで再評価
- 最短距離だけに依存しないrobust distanceで候補順を安定化
- 複数人画像でも顔ごとに候補を表示
- 判定画面 `index.html` はログインなしで公開可能
- 初期設定、人物名、権限、学習画像、リセットを `admin.html` に集約
- アップロード画像学習: `train-upload-image.html`
- 管理者が追加した画像からの学習: `train-from-image.html`
- 学習ページごとに、ログイン不要・共通パスワード・協力者ユーザーを選択可能
- 協力者パスワードはPHP `password_hash()` でハッシュ化
- ランタイムデータはローカルJSONで管理
- `.htaccess` で学習データJSONと管理者アップロード画像の直アクセスを拒否
- MySQL/PDO/外部DB依存なし
- 外部 `../data` 依存なし
- ブログ・仕分け専用データ構造に依存しない汎用設計
- 同一サーバー内の既存ページから使える埋め込み用ASTRA API
- 埋め込みAPIは管理画面からオン/オフと許可範囲を切替可能

## 技術アーキテクチャ

ASTRAは、フロントエンド推論、軽量な照合インデックス、JSON永続化、管理者設定、協力者権限、埋め込みAPIを小さく分けて構成しています。特定コミュニティのブログデータや外部DBに依存せず、人物名とdescriptorを登録すれば別のコミュニティにも適用できます。

### 1. ブラウザ推論

顔検出、ランドマーク推定、128次元descriptor生成はブラウザ側で行います。利用者が選んだ画像をサーバーの推論処理に送る必要がなく、GPUサーバーや常駐ワーカーを用意しなくても判定画面を提供できます。サーバーは学習済みdescriptor JSONを配信し、ブラウザがその場で候補を計算します。

### 2. Descriptorインデックス

保存済みdescriptorはJSON配列として管理されます。`matcher.js` は読み込み時に各descriptorを `Float32Array` に変換し、近すぎる重複descriptorを圧縮します。同じ画像や似た角度から何度も登録されたdescriptorが多い場合でも、照合対象を整理して候補が偏りにくい状態にします。

### 3. 代表プロトタイプと二段階照合

人物ごとに全descriptorを毎回見るのではなく、まず最大32件の代表プロトタイプを作ります。入力顔descriptorは最初にプロトタイプと比較され、上位候補だけが元の全descriptorで再評価されます。これにより、学習データが増えても全人物・全descriptorの重い比較を毎回行わず、ブラウザのみで実用的な速度を保ちやすくなります。

### 4. Robust Distance

単純な最近傍距離だけでは、ノイズのあるdescriptorや偶然近い1件に影響されることがあります。ASTRAは上位距離の平均と最短距離を組み合わせ、さらに近傍の一貫性をペナルティとして加えるrobust distanceを使います。候補順が極端な1件に依存しにくくなり、学習データが増えた時も安定したランキングを出しやすくなります。

### 5. JSON永続化

人物名、descriptor、統計、権限、セッションはJSONで保存されます。書き込みはファイルロック付きで行うため、協力者が同時に学習保存してもJSONが壊れにくい設計です。DBを用意しなくても動きますが、`data/*.json` は公開アセットにせず、`.htaccess` やWebサーバー設定で直アクセスを拒否します。

### 6. 管理と権限

管理者ログインは `.env` の管理者認証で行います。協力者向けの学習ページは、ログイン不要、共通パスワード、個別ユーザーのいずれかにできます。共通パスワードと協力者ユーザーのパスワードはハッシュ化して保存します。判定画面は公開し、学習保存や管理だけを制限する構成にできます。

### 7. 埋め込みAPI

`astra-api.php` と `astra-embed.js` を使うと、同一サーバー内の既存ページからASTRAの判定機能を呼び出せます。APIは管理画面からオン/オフでき、範囲を「判定のみ」または「判定と学習保存」に切り替えられます。外部サイトからのCORS利用は想定せず、同一オリジンのページまたはサーバー内PHPから使う設計です。

## 画面

```text
index.html               公開判定画面
admin.html               初期設定・管理画面
train-upload-image.html  協力者がローカル画像から学習
train-from-image.html    管理者が追加した画像から学習
astra-api.php            同一サーバー内埋め込み用API
astra-embed.js           既存ページ向けブラウザヘルパー
```

## セットアップ

1. `.env.example` を `.env` にコピーする
2. 管理者認証情報を設定する
3. `admin.html` を開く
4. コミュニティの人物名を登録する
5. 2つの学習ページの権限モードを選ぶ
6. 必要に応じて共通パスワードまたは協力者ユーザーを作る
7. 必要に応じて `train-from-image.html` 用の画像をアップロードする

`.env` の例:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD=change-this-password
```

本番ではパスワードハッシュの利用を推奨します。

```bash
php -r 'echo password_hash("your-password", PASSWORD_DEFAULT) . PHP_EOL;'
```

`.env`:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD_HASH=$2y$10$...
```

`.env` は `.gitignore` 対象です。コミットしないでください。

## 管理と権限

`admin.html` は常に `.env` の管理者認証が必要です。管理者は人物名の登録、学習ページごとの権限モード、共通パスワード、協力者ユーザー、フォルダ学習用画像、人物別の学習データリセットを操作できます。

判定画面 `index.html` はログイン不要です。学習ページは `admin.html` から個別に設定できます。

```text
none    ログイン不要
shared  共通パスワード
users   協力者ユーザー
```

共通パスワードと協力者ユーザーは `data/access.json` に保存されます。パスワードは平文ではなくPHPの `password_hash()` で保存されます。協力者ユーザーには、アップロード学習とフォルダ画像学習の権限を別々に付与できます。

## ASTRA APIの埋め込み

ASTRAを `/ASTRA/` に設置している場合、同じサーバーの別ページから `astra-embed.js` を読み込むことで、既存のトップページや管理者が持つ独自ページに判定機能を組み込めます。

まず `admin.html` の **ASTRA API** でAPIを有効化します。

```text
無効        埋め込みAPIを使わない
判定のみ    descriptor取得とブラウザ判定のみ許可
学習も許可  埋め込みページからdescriptor保存も許可
```

### ブラウザから判定する例

```html
<input type="file" id="photo" accept="image/*">
<pre id="result"></pre>

<script src="/ASTRA/astra-embed.js"></script>
<script>
const astra = AstraEmbed.create({ basePath: '/ASTRA/' });

document.getElementById('photo').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  await astra.init();
  const faces = await astra.recognizeImage(file);
  document.getElementById('result').textContent = JSON.stringify(faces, null, 2);
});
</script>
```

`recognizeImage()` は顔ごとに `box`、`score`、`descriptor`、`candidates` を返します。候補表示UIは既存ページ側で自由に作れます。

### 埋め込みページから学習保存する例

管理画面でASTRA APIの範囲を「判定と学習保存」にした場合のみ、埋め込みページからdescriptorを保存できます。

```js
const faces = await astra.recognizeImage(file);
await astra.saveDescriptor({
  member: 'Alice',
  descriptor: faces[0].descriptor,
  sourceName: 'custom-admin-page'
});
```

### PHPからサーバー内で読む例

同じサーバー内のPHPから直接データを読む場合は、HTTPではなく `astra-api.php` を読み込めます。

```php
<?php
require_once __DIR__ . '/ASTRA/astra-api.php';

$members = astra_api_members();
$stats = astra_api_stats();
```

### 埋め込みAPIの制限

- 管理画面で有効化されていない場合は `astra-api.php` は403を返す
- 外部サイト向けCORSヘッダーは出さない
- ブラウザからのHTTP利用は同一オリジン要求に限定
- サーバー外から公開APIとして使う用途は想定しない
- 学習保存は管理画面で「判定と学習保存」にした場合のみ許可

## 学習ワークフロー

### `train-upload-image.html`

協力者がローカル画像を選択します。画像はブラウザ内で解析され、APIへ送信されるのは顔descriptorと選択した人物名だけです。画像ファイル本体は保存しません。少量の手元画像から素早く初期descriptorを作りたい場合に向いています。

### `train-from-image.html`

管理者が `admin.html` から学習用画像を追加します。協力者は `train-from-image.html` でそれらの画像を順番に確認し、顔ごとに人物名を設定します。画像は `uploads/source/` に保存されますが、直接アクセスは `.htaccess` で拒否し、API経由で権限確認後に配信します。

### スムーズな学習のための設計

- 事前推論で候補人物を自動入力
- 推論が正しい場合は「正解」で次へ進める
- 変更がない顔を保存対象から外し、重複登録を減らす
- 小さすぎる顔や検出信頼度の低い顔は保存対象から外す
- 顔ごとにスキップ可能
- 保存後はブラウザ内インデックスを再読み込みし、次の画像から反映

## ランタイムデータ

以下のJSONは実行時に自動生成されます。

```text
data/descriptors.json  人物名ごとの顔descriptor
data/stats.json        人物ごとの登録数と最終更新日
data/members.json      人物名の基本設定
data/access.json       協力者権限とパスワードハッシュ
data/sessions.json     ログインセッション
```

`data/.htaccess` はJSONファイルへの直アクセスを拒否します。Apache以外では同等の拒否設定を行ってください。

## Git管理

以下はGit管理しません。

```text
.env
.env.*
data/*.json
uploads/train/*
uploads/source/*
```

`uploads/source/.htaccess` と `.gitkeep` はコミットしますが、アップロードされた画像はコミットしません。

## ディレクトリ構成

```text
.
├── index.html
├── admin.html
├── train-upload-image.html
├── train-from-image.html
├── app.js
├── admin.js
├── training.js
├── matcher.js
├── astra-api.php
├── astra-embed.js
├── api.php
├── style.css
├── data/
│   └── .htaccess
├── uploads/
│   ├── train/
│   │   └── .gitkeep
│   └── source/
│       ├── .gitkeep
│       └── .htaccess
├── assets/
└── icon/
```

## セキュリティ

- `.env` はバージョン管理に含めない
- 本番では `ASTRA_ADMIN_PASSWORD_HASH` の利用を推奨
- Apacheでは `data/.htaccess` と `uploads/source/.htaccess` を有効にする
- Nginxなどでは同等のアクセス拒否設定を行う
- ランタイムJSONやアップロード画像を公開アセットとして配布しない
- 協力者権限を使う場合はHTTPSで運用する
- 公開判定画面でブラウザ推論を行う都合上、判定に必要なdescriptorはAPI経由でブラウザに渡される
- `astra-api.php` は同一オリジン埋め込み用途であり、外部サイト向け公開APIとして扱わない

## ライセンス

Apache License 2.0. See [LICENSE](LICENSE).

---

<a id="english"></a>

# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** is **Adaptive Scalable Training Recognition Architecture**.

ASTRA is a browser-based face recognition and training-data management OSS for small communities, events, research datasets, and private collections. Face detection, descriptor extraction, and candidate matching run in the browser. The server does not need inference workers or a database. The PHP side focuses on settings, JSON storage, image delivery, access checks, and same-origin embedding APIs.

The core value of ASTRA is a **browser-only recognition pipeline**. face-api.js detects faces and creates descriptors, `matcher.js` ranks candidates, JSON APIs manage training data and settings, and `astra-api.php` / `astra-embed.js` let same-origin pages outside the ASTRA directory call ASTRA from existing site pages.

## Highlights

- Fast browser-only face matching with `matcher.js`
- No server-side inference or database-backed inference
- Browser-side face detection and descriptor extraction with face-api.js
- Lightweight descriptor comparison with 128-dimensional `Float32Array` values
- Near-duplicate descriptor compaction
- Per-person representative descriptor prototypes
- Two-stage candidate search: fast prototype scan, then refined full-descriptor scoring for top candidates
- Stable candidate ranking with robust distance instead of nearest-neighbor distance alone
- Per-face candidates for multi-person images
- Public recognition page with no login requirement
- Initial setup, people, access, source images, and resets centralized in `admin.html`
- Upload-image training: `train-upload-image.html`
- Admin-provided source-image training: `train-from-image.html`
- Separate access mode per training page
- Shared-password or individual contributor-user access
- Contributor passwords stored as PHP password hashes in JSON
- Runtime data stored in local JSON files
- `.htaccess` rules to deny direct access to JSON training data and admin-uploaded images
- No MySQL/PDO/database dependency
- No external `../data` dependency
- No blog/sorting data dependency
- Same-server embedding API for existing pages
- Admin-controlled API enable/disable and recognition/training scope

## Technical Architecture

ASTRA is split into browser inference, a lightweight descriptor index, JSON persistence, administration, contributor access, and a same-origin embedding API. It does not depend on a community-specific blog feed or an external database. Once people and descriptors are registered, the same structure can be used for another community or private dataset.

### 1. Browser Inference

Face detection, landmark detection, and 128-dimensional descriptor extraction run in the browser. User images do not need to be sent to a server-side inference worker. The server provides descriptor JSON and settings, while the browser computes the recognition candidates.

### 2. Descriptor Index

Saved descriptors are stored as JSON arrays. `matcher.js` converts valid descriptors into `Float32Array` values and compacts near-duplicates. This keeps each person's descriptor set cleaner and reduces bias from repeated registrations of nearly identical faces.

### 3. Representative Prototypes And Two-Stage Matching

Instead of scanning every descriptor first, ASTRA builds up to 32 representative prototypes per person. Input descriptors are compared against prototypes first, and only the top candidate people are re-scored against their full descriptor sets. This keeps matching practical in the browser as the dataset grows.

### 4. Robust Distance

Nearest-neighbor distance alone can be unstable when one noisy descriptor happens to be close. ASTRA combines the closest distance with the average of top distances and adds a consistency penalty. This robust distance makes candidate ranking less dependent on a single accidental match.

### 5. JSON Persistence

People, descriptors, statistics, access settings, and sessions are stored as JSON. Writes use file locking so concurrent training saves are less likely to corrupt JSON files. Runtime JSON files should not be published as static assets; use `.htaccess` or equivalent web server rules to deny direct access.

### 6. Administration And Access

Admin login is configured through `.env`. Contributor training pages can be open, shared-password protected, or individual-user protected. Shared and contributor passwords are stored as hashes. Recognition can remain public while training and administration stay gated.

### 7. Embedding API

`astra-api.php` and `astra-embed.js` let existing same-origin pages call ASTRA. The API can be enabled or disabled from `admin.html`, and its scope can be set to recognition-only or recognition plus training saves. It is designed for same-server embedding, not cross-origin public API use.

## Pages

```text
index.html               Public recognition page
admin.html               Admin setup and management
train-upload-image.html  Train from collaborator-uploaded local images
train-from-image.html    Train from images uploaded by the admin
astra-api.php            Same-origin embedding API
astra-embed.js           Browser helper for existing pages
```

## Setup

1. Copy `.env.example` to `.env`.
2. Set the admin credentials.
3. Open `admin.html`.
4. Register the people/members for your community.
5. Choose access modes for the two training pages.
6. Optionally set a shared contributor password or create contributor users.
7. Optionally upload source images for `train-from-image.html`.

Example `.env`:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD=change-this-password
```

For production, prefer a password hash:

```bash
php -r 'echo password_hash("your-password", PASSWORD_DEFAULT) . PHP_EOL;'
```

Then put it in `.env`:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD_HASH=$2y$10$...
```

`.env` is ignored by Git and should not be committed.

## Administration And Access

`admin.html` always requires the admin credentials from `.env`. Administrators can manage people, training-page access modes, shared passwords, contributor users, source images, and per-person descriptor resets.

The recognition page, `index.html`, does not require login. Each training page can be configured independently in `admin.html`:

```text
none    No login required
shared  Shared contributor password
users   Individual contributor users
```

Contributor users and the shared password are stored in `data/access.json`. Passwords are saved with PHP `password_hash()`, not in plain text. Contributor users can receive upload-training and source-image-training permissions separately.

## Embedding ASTRA API

If ASTRA is installed under `/ASTRA/`, another page on the same server can load `astra-embed.js` and call ASTRA from an existing homepage, admin page, or custom workflow.

First, enable **ASTRA API** in `admin.html`.

```text
Disabled           Do not expose the embedding API
Recognition only   Allow descriptor loading and browser recognition
Training allowed   Also allow descriptor saves from embedded pages
```

### Browser Recognition Example

```html
<input type="file" id="photo" accept="image/*">
<pre id="result"></pre>

<script src="/ASTRA/astra-embed.js"></script>
<script>
const astra = AstraEmbed.create({ basePath: '/ASTRA/' });

document.getElementById('photo').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  await astra.init();
  const faces = await astra.recognizeImage(file);
  document.getElementById('result').textContent = JSON.stringify(faces, null, 2);
});
</script>
```

`recognizeImage()` returns `box`, `score`, `descriptor`, and `candidates` for each detected face. The host page can render its own UI around that result.

### Embedded Training Save Example

Descriptor saves are only allowed when the admin sets ASTRA API scope to training.

```js
const faces = await astra.recognizeImage(file);
await astra.saveDescriptor({
  member: 'Alice',
  descriptor: faces[0].descriptor,
  sourceName: 'custom-admin-page'
});
```

### Server-Side PHP Example

For PHP code on the same server, include `astra-api.php` directly instead of using HTTP.

```php
<?php
require_once __DIR__ . '/ASTRA/astra-api.php';

$members = astra_api_members();
$stats = astra_api_stats();
```

### Embedding API Limits

- `astra-api.php` returns 403 unless enabled in `admin.html`
- No CORS headers are emitted for external sites
- Browser HTTP access is limited to same-origin requests
- The API is not intended as a cross-origin public API
- Descriptor saves require the training scope

## Training Workflows

### `train-upload-image.html`

Collaborators select one or more local image files. ASTRA analyzes them in the browser and sends only face descriptors and selected person names to the API. The original image files are not saved. This workflow is useful for quickly building initial descriptors from a small local image set.

### `train-from-image.html`

Admins upload source images from `admin.html`. Collaborators then process those images from `train-from-image.html`. The images are stored under `uploads/source/` and served through `api.php` after access checks. Direct web access to that folder is denied by `.htaccess`.

### Smooth Training Design

- Candidate people are prefilled from current inference data
- Correct predictions can be accepted quickly
- Unchanged predictions can be skipped to reduce duplicate saves
- Faces that are too small or have low detection confidence are excluded from saving
- Each face can be skipped manually
- The browser-side index is refreshed after saving so the next image uses new data

## Runtime Data

Runtime JSON files are created automatically:

```text
data/descriptors.json  Face descriptors grouped by person name
data/stats.json        Descriptor count and last update per person
data/members.json      People/member name settings
data/access.json       Contributor access settings and password hashes
data/sessions.json     Runtime login sessions
```

The `data/.htaccess` file denies direct access to JSON files. Keep this file on Apache deployments. For other web servers, configure equivalent rules so these files cannot be downloaded directly.

## Git Ignore

Runtime files and secrets are ignored:

```text
.env
.env.*
data/*.json
uploads/train/*
uploads/source/*
```

`uploads/source/.htaccess` and `.gitkeep` are committed, but uploaded source images are not.

## Directory Structure

```text
.
├── index.html
├── admin.html
├── train-upload-image.html
├── train-from-image.html
├── app.js
├── admin.js
├── training.js
├── matcher.js
├── astra-api.php
├── astra-embed.js
├── api.php
├── style.css
├── data/
│   └── .htaccess
├── uploads/
│   ├── train/
│   │   └── .gitkeep
│   └── source/
│       ├── .gitkeep
│       └── .htaccess
├── assets/
└── icon/
```

## Security Notes

- Keep `.env` outside version control
- Use `ASTRA_ADMIN_PASSWORD_HASH` in production when possible
- Keep `data/.htaccess` and `uploads/source/.htaccess` enabled on Apache
- Configure equivalent deny rules on Nginx or other servers
- Do not publish runtime JSON files or uploaded source images as repository assets
- Use HTTPS when contributor access is enabled
- Because public recognition runs in the browser, descriptor data required for recognition is delivered to the browser through the API
- Treat `astra-api.php` as a same-origin embedding API, not as a cross-origin public API

## License

Apache License 2.0. See [LICENSE](LICENSE).
