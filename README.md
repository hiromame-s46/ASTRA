# ASTRA

![ASTRA logo](assets/astra-logo.png)

**English version is [here](#english).**

**ASTRA** は **Adaptive Scalable Training Recognition Architecture** の略称です。

ASTRAは、小規模コミュニティ向けのブラウザベース顔認識・学習データ管理OSSです。最大の特徴は、`matcher.js` によるブラウザのみで動く高速推論です。サーバー側で推論を実行せず、ブラウザ内で顔descriptorのインデックスを構築し、画像内の顔ごとに人物候補を即時に返します。

## 特徴

- `matcher.js` によるブラウザ完結の高速顔照合
- サーバー推論・DB推論なしで動作
- 128次元descriptorを `Float32Array` に変換して軽量に比較
- 重複descriptorを圧縮し、照合対象を整理
- 人物ごとに代表descriptorプロトタイプを構築
- プロトタイプで高速に候補を絞り込み、上位候補だけを全descriptorで再評価
- 最短距離だけに頼らない robust distance で安定した候補順を生成
- 複数人画像でも顔ごとに候補を表示
- 判定画面はログイン不要で公開可能
- 初期設定と運用管理は `admin.html` に集約
- 人物名の基本設定を `admin.html` から管理
- アップロード画像学習: `train-upload-image.html`
- 管理者が追加した画像からの学習: `train-from-image.html`
- 学習ページごとに権限モードを設定可能
- 共通パスワードまたは協力者ユーザーで学習権限を管理
- 協力者パスワードはハッシュ化してJSON保存
- ランタイムデータはローカルJSONで管理
- `.htaccess` で学習データJSONの直アクセスを拒否
- MySQL/PDO/DB依存なし
- 外部 `../data` 依存なし
- ブログ・仕分けワークフロー依存なし

## ブラウザ高速推論

ASTRAの照合コアは `matcher.js` です。学習済みdescriptorを読み込むと、ブラウザ上で人物ごとの軽量インデックスを作成します。

処理の流れ:

1. `data/descriptors.json` から人物ごとのdescriptorを読み込む
2. descriptorを `Float32Array` に変換する
3. 近すぎる重複descriptorを除外する
4. 人物ごとに代表プロトタイプを最大32件まで作る
5. 入力顔descriptorをまずプロトタイプと比較する
6. 上位候補だけを元の全descriptorで再評価する
7. robust distance で候補を並べ替える

この二段階照合により、学習データが増えてもブラウザのみで実用的な速度を保ちやすくしています。顔検出とdescriptor抽出もブラウザ側の face-api.js で行うため、サーバーはJSON保存、設定、画像配信、権限確認に集中できます。

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

## 権限モデル

`admin.html` は常に `.env` の管理者認証が必要です。

判定画面 `index.html` はログイン不要です。

各学習ページは `admin.html` から個別に設定できます。

```text
none    ログイン不要
shared  共通パスワード
users   協力者ユーザー
```

共通パスワードと協力者ユーザーは `data/access.json` に保存されます。パスワードは平文ではなくPHPの `password_hash()` で保存されます。

## 学習ワークフロー

### `train-upload-image.html`

協力者がローカル画像を選択します。画像はブラウザ内で解析され、APIへ送信されるのは顔descriptorと選択した人物名だけです。画像ファイル本体は保存しません。

### `train-from-image.html`

管理者が `admin.html` から学習用画像を追加します。協力者は `train-from-image.html` でそれらの画像を順番に確認し、顔ごとに人物名を設定します。画像は `uploads/source/` に保存されますが、直接アクセスは `.htaccess` で拒否し、API経由で権限確認後に配信します。

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

## リリース

リリースノートは [CHANGELOG.md](CHANGELOG.md) を参照してください。

## セキュリティ

- `.env` はバージョン管理に含めない
- 本番では `ASTRA_ADMIN_PASSWORD_HASH` の利用を推奨
- Apacheでは `data/.htaccess` と `uploads/source/.htaccess` を有効にする
- Nginxなどでは同等のアクセス拒否設定を行う
- ランタイムJSONやアップロード画像を公開アセットとして配布しない
- 協力者権限を使う場合はHTTPSで運用する

## ライセンス

MIT License. See [LICENSE](LICENSE).

---

<a id="english"></a>

# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** is **Adaptive Scalable Training Recognition Architecture**.

ASTRA is a browser-based face recognition and training-data management app for small communities. Its main selling point is fast browser-only inference powered by `matcher.js`. ASTRA does not need server-side inference: it builds a face descriptor index in the browser and returns person candidates for each detected face directly on the client.

## Highlights

- Fast browser-only face matching with `matcher.js`
- No server-side inference or database-backed inference
- Lightweight descriptor comparison with 128-dimensional `Float32Array` values
- Duplicate descriptor compaction
- Per-person descriptor prototype generation
- Two-stage candidate search: fast prototype scan, then refined full-descriptor scoring for top candidates
- Stable candidate ranking with robust distance instead of nearest-neighbor distance alone
- Per-face candidates for multi-person images
- Public recognition page with no login requirement
- Initial setup and operations centralized in `admin.html`
- Person/member names managed from `admin.html`
- Upload-image training: `train-upload-image.html`
- Admin-provided source-image training: `train-from-image.html`
- Separate access mode per training page
- Shared-password or individual contributor-user access
- Contributor passwords stored as hashes in JSON
- Runtime data stored in local JSON files
- `.htaccess` rules to deny direct access to JSON training data
- No MySQL/PDO/database dependency
- No external `../data` dependency
- No blog/sorting workflow dependency

## Fast Browser Inference

ASTRA's matching core is `matcher.js`. When descriptor data is loaded, it builds a lightweight per-person index in the browser.

Pipeline:

1. Load descriptors from `data/descriptors.json`
2. Convert descriptor arrays into `Float32Array`
3. Remove near-duplicate descriptors
4. Build up to 32 representative prototypes per person
5. Compare an input face descriptor against prototypes first
6. Re-score only top candidates against full descriptors
7. Sort candidates with robust distance

This two-stage matching design keeps inference practical in the browser as training data grows. Face detection and descriptor extraction also run in the browser with face-api.js, so the server only handles JSON storage, settings, image delivery, and access checks.

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

## Access Model

`admin.html` always requires the admin credentials from `.env`.

The recognition page, `index.html`, does not require login.

Each training page can be configured independently in `admin.html`:

```text
none    No login required
shared  Shared contributor password
users   Individual contributor users
```

Contributor users and the shared password are stored in `data/access.json`. Passwords are saved with PHP `password_hash()`, not in plain text.

## Training Workflows

### `train-upload-image.html`

Collaborators select one or more local image files. ASTRA analyzes them in the browser and sends only face descriptors and selected person names to the API. The original image files are not saved.

### `train-from-image.html`

Admins upload source images from `admin.html`. Collaborators then process those images from `train-from-image.html`. The images are stored under `uploads/source/` and served through `api.php` after access checks. Direct web access to that folder is denied by `.htaccess`.

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

## Releases

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Security Notes

- Keep `.env` outside version control.
- Use `ASTRA_ADMIN_PASSWORD_HASH` in production when possible.
- Keep `data/.htaccess` and `uploads/source/.htaccess` enabled on Apache.
- Configure equivalent deny rules on Nginx or other servers.
- Do not publish runtime JSON files or uploaded source images as repository assets.
- Use HTTPS when contributor access is enabled.

## License

MIT License. See [LICENSE](LICENSE).
