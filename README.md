# ASTRA

![ASTRA logo](assets/astra-logo.png)

**English version is [here](#english).**

**ASTRA** は **Adaptive Scalable Training Recognition Architecture** の略称です。

ASTRAは、イベント運営、小規模コミュニティ、研究用データ整理、プライベートな画像アーカイブなどに、自分たちの環境で顔認識を組み込むためのOSSです。人物名を登録し、少しずつ顔descriptorを学習していくことで、画像内の顔に対して候補者を表示できるようになります。

推論は利用者のブラウザ内で完結します。サーバー側にGPU、常駐推論プロセス、MySQLなどのDBを用意する必要はありません。PHPは管理設定、JSON保存、画像配信、権限確認、埋め込みAPIを担当し、顔検出、descriptor抽出、候補照合はフロントエンドで実行します。一般的なPHPサーバーや既存サイトにも載せやすく、まず小さく導入して、必要な人物と学習データを後から育てていける構成です。

ASTRA単体の判定・学習画面をそのまま使うことも、同じサーバー上の既存ページから `astra-api.php` と `astra-embed.js` を呼び出して判定機能を埋め込むこともできます。公開するのは判定画面だけにして、学習や管理は管理者・協力者だけに制限する、といった運用も `admin.html` から設定できます。

## 主な特徴

- ブラウザだけで顔検出、descriptor抽出、候補照合を実行
- サーバー側の推論環境やDBを用意せずに運用可能
- 判定画面 `index.html` はログインなしで公開可能
- 初期設定、人物登録、権限、学習画像、学習データのリセットを `admin.html` に集約
- 協力者が自分の画像から学習できる `train-upload-image.html`
- 管理者が用意した画像を協力者が確認して学習できる `train-from-image.html`
- 学習ページごとに、ログインなし、共通パスワード、協力者ユーザーを選択可能
- 協力者用パスワードはadmin保存時にPHP `password_hash()` で必ずハッシュ化
- 学習データ、人物設定、統計、権限設定はローカルJSONで管理
- JSON書き込みはファイルロック付きで、同時保存による破損を抑制
- `.htaccess` で学習データJSONと管理者アップロード画像の直アクセスを拒否
- 同一サーバー内の既存ページから使えるASTRA APIを同梱
- 埋め込みAPIは管理画面からオン/オフと許可範囲を切替可能
- 人物名とdescriptorを登録していく汎用設計

## 技術アーキテクチャ

ASTRAは、フロントエンド推論、照合インデックス、JSON永続化、管理者設定、協力者権限、埋め込みAPIを分けて構成しています。用途ごとの専用データ構造に固定せず、人物名とdescriptorを中心に扱うため、コミュニティ、イベント、研究用データセット、社内アーカイブなどに合わせて運用できます。

### 1. ブラウザ推論

顔検出、ランドマーク推定、128次元descriptor生成はブラウザ側で行います。利用者が選んだ画像をサーバー側の推論処理に渡す必要がなく、GPUサーバーや常駐ワーカーを用意しなくても判定画面を提供できます。サーバーは設定と学習済みdescriptorを配信し、ブラウザがその場で候補を計算します。

### 2. 照合インデックス

保存済みdescriptorはJSON配列として管理されます。読み込み時には各descriptorをブラウザで扱いやすい数値配列に変換し、近すぎる重複descriptorを整理します。同じ画像や似た角度から何度も登録されたdescriptorが多い場合でも、照合対象を軽くし、候補が偏りにくい状態にします。

### 3. 代表プロトタイプと二段階照合

人物ごとに全descriptorを毎回比較するのではなく、まず代表的なdescriptorを使って候補を絞り込みます。その後、上位候補だけを元のdescriptor群で再評価します。学習データが増えても全人物・全descriptorを毎回総当たりしないため、ブラウザだけでも実用的な速度を保ちやすくなります。

### 4. Robust Distance

単純な最近傍距離だけでは、ノイズのあるdescriptorや偶然近い1件に候補順が引っ張られることがあります。ASTRAは最短距離だけでなく、近いdescriptor群のまとまりも見て候補を並べます。これにより、学習データが増えた時も、極端な1件に依存しにくいランキングを出しやすくなります。

### 5. JSON永続化

人物名、descriptor、統計、権限、セッションはJSONで保存されます。書き込みはファイルロック付きで行うため、複数人が同時に学習保存してもJSONが壊れにくい設計です。DBを用意しなくても動きますが、`data/*.json` は公開アセットとして扱わず、`.htaccess` やWebサーバー設定で直アクセスを拒否してください。

### 6. 管理と権限

管理者ログインは `.env` の管理者認証で行います。協力者向けの学習ページは、ログイン不要、共通パスワード、個別ユーザーのいずれかにできます。共通パスワードと協力者ユーザーのパスワードは、admin保存時にハッシュ化して保存します。判定画面は公開し、学習保存や管理だけを制限する構成にできます。

### 7. 埋め込みAPI

`astra-api.php` と `astra-embed.js` を使うと、同一サーバー内の既存ページからASTRAの判定機能を呼び出せます。APIは管理画面からオン/オフでき、範囲を「判定のみ」または「判定と学習保存」に切り替えられます。外部サイトから利用する公開APIではなく、同じサイト内のページやサーバー内PHPから使う設計です。

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

1. ファイル一式をPHPが動作するサーバーに配置する
2. `.env.example` を `.env` にコピーする
3. 管理者ログイン用のユーザー名とパスワードを設定する
4. `admin.html` にログインする
5. 判定対象にしたい人物名を登録する
6. 学習ページの権限モードを決める
7. 必要に応じて共通パスワードまたは協力者ユーザーを作成する
8. `train-upload-image.html` または `train-from-image.html` で学習データを追加する
9. `index.html` で判定を確認する

`.env` の例:

```dotenv
ASTRA_ADMIN_USERNAME=admin
ASTRA_ADMIN_PASSWORD=change-this-password
```

`.env` がWebから直接読めない状態で管理されているなら、管理者パスワードは `ASTRA_ADMIN_PASSWORD` に直接書いても動作します。必要に応じて、平文の代わりにハッシュを設定できます。

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

`admin.html` は常に `.env` の管理者認証が必要です。ASTRAの初期設定と運用設定はここに集約されています。

管理者ができること:

- 人物名の登録、並び替え、削除
- 学習ページごとの権限モード設定
- 共通パスワードの設定
- 協力者ユーザーの作成、停止、削除
- 協力者ユーザーごとの学習権限設定
- `train-from-image.html` 用の画像アップロード
- 特定人物の学習データリセット
- ASTRA APIのオン/オフと許可範囲の設定

判定画面 `index.html` はログインなしで使えます。学習ページは `admin.html` から個別に設定できます。

```text
none    ログインなし。URLを知っている人が学習できる
shared  共通パスワードで学習できる
users   管理者が作成した協力者ユーザーだけが学習できる
```

共通パスワードと協力者ユーザーは `admin.html` から設定し、`data/access.json` に保存されます。保存時にPHPの `password_hash()` を通すため、協力者用パスワードは平文では保存されません。協力者ユーザーには、アップロード学習とフォルダ画像学習の権限を別々に付与できます。

## ASTRA APIの埋め込み

ASTRAを `/ASTRA/` に設置している場合、同じサーバーの別ページから `astra-embed.js` を読み込むことで、既存のトップページ、会員ページ、管理者用ページなどにASTRAの判定機能を組み込めます。ASTRAの画面をそのまま使うだけでなく、既存サイトのUIに合わせた判定画面を作りたい場合に使います。

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

`recognizeImage()` は検出した顔ごとに `box`、`score`、`descriptor`、`candidates` を返します。候補表示UI、確認ボタン、保存ボタンなどは既存ページ側で自由に作れます。

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

同じサーバー内のPHPから直接データを読む場合は、HTTPリクエストではなく `astra-api.php` を読み込めます。

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

協力者がローカル画像を選択して学習します。画像はブラウザ内で解析され、APIへ送信されるのは顔descriptorと選択した人物名です。画像ファイル本体は保存しません。手元の画像から素早く初期学習データを作りたい場合や、画像をサーバーに残したくない場合に向いています。

### `train-from-image.html`

管理者が `admin.html` から学習用画像を追加し、協力者が `train-from-image.html` でそれらの画像を確認します。顔ごとに候補が表示されるため、正しい人物を選んで保存します。画像は `uploads/source/` に保存されますが、直接アクセスは `.htaccess` で拒否し、API経由で権限確認後に配信します。

### スムーズな学習のための設計

- 現在の学習データから候補人物を自動表示
- 推論が正しい場合は最小限の操作で保存可能
- 変更がない顔を保存対象から外し、重複登録を減らす
- 小さすぎる顔や検出信頼度の低い顔は保存対象から外す
- 顔ごとにスキップ可能
- 保存後はブラウザ内インデックスを再読み込みし、次の画像から反映

## ランタイムデータ

以下のJSONは実行時に自動生成されます。リポジトリに含めるファイルではなく、各サーバーで運用しながら育っていくデータです。

```text
data/descriptors.json  人物名ごとの顔descriptor
data/stats.json        人物ごとの登録数と最終更新日
data/members.json      人物名の基本設定
data/access.json       協力者権限とパスワードハッシュ
data/sessions.json     ログインセッション
```

`data/.htaccess` はJSONファイルへの直アクセスを拒否します。Apache以外では同等の拒否設定を行ってください。`data/*.json` はGit管理から外すことを推奨します。

## Git管理

以下はGit管理しません。`.gitignore` に含めておくことを推奨します。

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
- `.env` をWebから直接読めない場所または設定で保護する
- 管理者パスワードは `ASTRA_ADMIN_PASSWORD` に直接設定できる。必要に応じて `ASTRA_ADMIN_PASSWORD_HASH` も使える
- 協力者の共通パスワードと個別ユーザーのパスワードは、admin保存時に必ずハッシュ化される
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
- Contributor passwords are always hashed with PHP `password_hash()` when saved from admin
- Runtime data stored in local JSON files
- `.htaccess` rules to deny direct access to JSON training data and admin-uploaded images
- Lightweight setup that can start without provisioning MySQL or another database
- General-purpose structure built around registered people and descriptors
- Same-server embedding API for existing pages
- Admin-controlled API enable/disable and recognition/training scope

## Technical Architecture

ASTRA is split into browser inference, a lightweight descriptor index, JSON persistence, administration, contributor access, and a same-origin embedding API. Because it is built around registered people and descriptors, the same structure can grow with communities, events, research datasets, internal archives, or private collections.

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

If `.env` cannot be read directly from the web, `ASTRA_ADMIN_PASSWORD` can be used as a plain environment value. For stricter deployments, use a hash instead of the plain value:

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

Contributor users and the shared password are configured from `admin.html` and stored in `data/access.json`. They are passed through PHP `password_hash()` when saved, so contributor passwords are not stored in plain text. Contributor users can receive upload-training and source-image-training permissions separately.

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
- Protect `.env` so it cannot be read directly from the web
- The admin password can be set directly with `ASTRA_ADMIN_PASSWORD`; `ASTRA_ADMIN_PASSWORD_HASH` is available when you want hashed admin credentials
- Contributor shared passwords and individual user passwords are always hashed when saved from admin
- Keep `data/.htaccess` and `uploads/source/.htaccess` enabled on Apache
- Configure equivalent deny rules on Nginx or other servers
- Do not publish runtime JSON files or uploaded source images as repository assets
- Use HTTPS when contributor access is enabled
- Because public recognition runs in the browser, descriptor data required for recognition is delivered to the browser through the API
- Treat `astra-api.php` as a same-origin embedding API, not as a cross-origin public API

## License

Apache License 2.0. See [LICENSE](LICENSE).
