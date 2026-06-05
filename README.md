# ASTRA

![ASTRA logo](assets/astra-logo.png)

**English version is [here](#english).**

**ASTRA** は **Adaptive Scalable Training Recognition Architecture** の略称です。

ASTRAは、小規模コミュニティやイベント運営、研究用データ整理などに使える、ブラウザベースの顔認識・学習データ管理OSSです。顔検出と顔descriptor抽出はブラウザ上で行い、照合も `matcher.js` がブラウザ内で実行します。サーバーに推論処理やDBを持たせず、PHP APIは設定、JSON保存、画像配信、権限確認に集中します。

このプロジェクトの中心は、**ブラウザのみで動く高速推論**です。`matcher.js` は、保存済みdescriptorをそのまま総当たりするだけではなく、重複除去、人物ごとの代表プロトタイプ構築、二段階候補検索、robust distanceによる安定スコアリングを行います。これにより、共有サーバーや静的寄りのPHP環境でも導入しやすく、利用者の画像をサーバー推論に送らずに判定体験を作れます。

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

## 独自技術: `matcher.js`

ASTRAの照合コアは `matcher.js` です。一般的な小規模実装では、入力顔descriptorと保存済みdescriptorを単純に総当たり比較し、最短距離だけで候補を選びがちです。ASTRAはそれを避け、ブラウザ内で軽量な検索インデックスを作ります。

### 1. Descriptor正規化

保存済みdescriptorはJSON配列として管理されます。`matcher.js` は読み込み時に各descriptorを128次元の `Float32Array` に変換します。これにより、比較時の数値処理を安定させ、ブラウザ内で扱いやすい形に揃えます。

### 2. 重複descriptorの圧縮

同じ画像や似た角度から何度も登録されたdescriptorが多いと、推論速度が落ちるだけでなく、特定の顔だけに候補が引っ張られやすくなります。`matcher.js` は `duplicateDistance` 以下の近すぎるdescriptorを重複として扱い、人物ごとのdescriptor集合を圧縮します。

### 3. 代表プロトタイプ生成

人物ごとに全descriptorを毎回見るのではなく、まず最大32件の代表プロトタイプを作ります。中心に近いdescriptorから始め、遠い特徴も拾うように選択し、その後クラスタごとに代表を再調整します。これにより、正面、横顔、照明差、表情差のような幅を残しながら、照合対象を軽量化します。

### 4. 二段階候補検索

入力顔descriptorに対して、まず各人物のプロトタイプだけを比較します。ここで候補人物を高速に絞り込み、上位候補だけを元の全descriptorで再評価します。大量のdescriptorを持つ運用でも、全人物・全descriptorの重い比較を毎回行わないため、ブラウザのみで実用的な速度を保ちやすくなります。

### 5. Robust Distance

単純な最近傍距離だけでは、ノイズのあるdescriptorや偶然近い1件に影響されることがあります。ASTRAは上位距離の平均と最短距離を組み合わせ、さらに近傍の一貫性をペナルティとして加えるrobust distanceを使います。これにより、候補順が極端な1件に依存しにくくなり、学習データが増えた時も安定したランキングを出しやすくなります。

### 6. 完全ブラウザ実行の利点

- 利用者画像をサーバー推論に送らない
- GPUサーバーや常駐推論プロセスが不要
- PHPが動く一般的なレンタルサーバーでも導入しやすい
- 判定画面を公開しつつ、学習や管理だけを権限管理できる
- descriptor JSONを差し替えるだけで推論データを更新できる

## 画面

```text
index.html               公開判定画面
admin.html               初期設定・管理画面
train-upload-image.html  協力者がローカル画像から学習
train-from-image.html    管理者が追加した画像から学習
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

## ライセンス

Apache License 2.0. See [LICENSE](LICENSE).

---

<a id="english"></a>

# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** is **Adaptive Scalable Training Recognition Architecture**.

ASTRA is a browser-based face recognition and training-data management OSS for small communities, events, research datasets, and private collections. Face detection and descriptor extraction run in the browser, and matching is also performed in the browser by `matcher.js`. The server does not need inference workers or a database. The PHP API focuses on settings, JSON storage, image delivery, and access checks.

The core value of ASTRA is **fast browser-only inference**. `matcher.js` does more than a naive all-vs-all descriptor scan: it normalizes descriptors, compacts near-duplicates, builds per-person representative prototypes, performs two-stage candidate search, and ranks candidates with robust distance. This makes ASTRA practical on simple PHP hosting while keeping user images away from server-side inference.

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

## Original Technology: `matcher.js`

ASTRA's matching core is `matcher.js`. A simple small-scale face matcher often compares the input descriptor against every saved descriptor and chooses the nearest one. ASTRA avoids relying on that alone. It builds a lightweight browser-side search index that stays useful as training data grows.

### 1. Descriptor Normalization

Saved descriptors are stored as JSON arrays. `matcher.js` converts each valid descriptor into a 128-dimensional `Float32Array` at load time. This keeps numeric comparison predictable and efficient inside the browser.

### 2. Duplicate Compaction

Repeated registrations from the same image or nearly identical angles can slow inference and bias results. `matcher.js` treats descriptors closer than `duplicateDistance` as near-duplicates and compacts each person's descriptor set before building the index.

### 3. Representative Prototypes

Instead of scanning every descriptor first, ASTRA builds up to 32 representative prototypes per person. It starts near the descriptor centroid, then keeps descriptors that cover farther variations, and refines cluster representatives. This keeps useful variation such as pose, lighting, and expression while reducing the first-pass search cost.

### 4. Two-Stage Candidate Search

For each input face, ASTRA first compares the descriptor against each person's prototypes. It then refines only the top candidate people against their full descriptor sets. This avoids repeatedly scanning every descriptor for every person and keeps matching practical as the dataset grows.

### 5. Robust Distance

Nearest-neighbor distance alone can be unstable when a single noisy descriptor happens to be close. ASTRA combines the closest distance with the average of the top distances and adds a consistency penalty. This robust distance makes candidate ranking less dependent on one accidental match.

### 6. Why Browser-Only Matters

- User images do not need to be sent to a server-side inference process
- No GPU server or resident model worker is required
- The app can run on ordinary PHP hosting
- Recognition can be public while training and admin operations remain gated
- Updating the descriptor JSON updates the browser-side inference data

## Pages

```text
index.html               Public recognition page
admin.html               Admin setup and management
train-upload-image.html  Train from collaborator-uploaded local images
train-from-image.html    Train from images uploaded by the admin
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

## License

Apache License 2.0. See [LICENSE](LICENSE).
