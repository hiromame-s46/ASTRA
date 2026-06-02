# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** は **Adaptive Sakurazaka Technology Recognition Architecture** の略称です。

## 概要 日本語

ASTRAは、櫻坂46メンバーの画像認識を目的として設計した、ブラウザベースの顔認識・学習支援アーキテクチャです。画像内の顔を検出し、収集済みの顔特徴量データと照合して、顔ごとにメンバー候補を表示します。

主な用途は、画像からのメンバー推定、複数人画像の顔ごとの判定、顔特徴量データの登録、ブログ画像を使った学習データ整理です。判定画面はシンプルに画像を選んで結果を見る構成にし、学習画面と仕分け画面ではデータ収集を効率化するための操作に集中できるようにしています。

ASTRAは、顔認識モデル、照合ロジック、収集データ、学習統計、API、UI、ブランドアセットを1つの独立したプロジェクトとしてまとめています。一方で、メンバー情報やブログ画像一覧のようなマスターデータはASTRA内に複製せず、共有の `../data` ディレクトリを参照します。これにより、ASTRAはAI判定と学習データ管理に専念できます。

## Overview English

**ASTRA** stands for **Adaptive Sakurazaka Technology Recognition Architecture**.

ASTRA is a browser-based face recognition and training-support architecture designed for recognizing Sakurazaka46 members. It detects faces in images, compares each detected face against collected facial descriptor data, and displays member candidates for each face.

Its core use cases are member recognition from images, per-face recognition in multi-person images, facial descriptor registration, and training-data organization using blog images. The recognition page is intentionally simple: choose images and review the results. The training and sorting pages focus on efficient data collection and correction workflows.

ASTRA is organized as an independent project containing the recognition model flow, matching logic, collected training data, statistics, API, UI, and brand assets. Member profiles and blog image master data are not duplicated inside ASTRA; they are loaded from the shared `../data` directory. This keeps ASTRA focused on AI recognition and training-data management.

## 詳細 日本語

### コンセプト

ASTRAは、顔画像を「検出する」「特徴量に変換する」「登録済みデータと比較する」「候補を提示する」「正解データを蓄積する」という一連の流れを扱うための軽量なWebアプリケーションです。

設計方針は次の通りです。

- ブラウザ上で顔検出と特徴量抽出を行う
- サーバー側はdescriptor保存、統計生成、画像プロキシ、認証確認に集中する
- 画像本体ではなく128次元の顔descriptorを収集する
- マスターデータと学習データを分離する
- 判定画面はできるだけ候補を返す
- 学習画面と仕分け画面は誤登録を減らすため保守的に扱う
- データ形式を単純なJSONにして運用しやすくする

### 主な機能

- 画像アップロードによる顔判定
- 複数画像の一括判定
- 1枚の画像に複数人が写っている場合の顔ごとの候補表示
- 顔検出フレームの表示切り替え
- 顔ごとの切り抜きプレビュー
- 小さい顔や曖昧な顔にもできるだけ候補を表示する判定モード
- 顔descriptorの登録
- ブログ画像を使った学習データ作成
- 協力者向けの仕分け専用画面
- 事前推論によるメンバー候補の自動入力
- 推論が正しい場合の効率学習モード
- 顔ごとのスキップ指定
- 登録件数や最終更新日を表示する学習統計
- 外部画像取得用の画像プロキシ
- ログイン状態に応じた学習・仕分け権限制御

### 画面

```text
index.html  判定画面
train.html  学習画面
sort.html   仕分け専用画面
```

#### 判定画面 `index.html`

判定画面は、利用者が画像をアップロードしてメンバー候補を見るための画面です。

できること:

- 画像を1枚または複数枚選択する
- 画像内の顔をすべて検出する
- 顔ごとに候補メンバーと信頼度を表示する
- 顔の切り抜きを一覧で確認する
- 画像上の検出フレームをオン・オフする
- 小さい顔や曖昧な顔でも参考候補を表示する

判定画面では、学習画面よりも候補表示を優先しています。顔が小さい、検出スコアが低い、1位と2位の候補が近いといった場合でも、距離が許容範囲内であれば参考候補を出す設計です。

#### 学習画面 `train.html`

学習画面は、正しい顔descriptorを収集するための管理向け画面です。

対応する入力:

- ブログ画像
- アップロード画像
- 直接指定した画像URL

できること:

- 顔ごとにメンバーを割り当てる
- 顔ごとにスキップする
- 事前推論結果を確認して修正する
- 効率学習モードで、推論が変わっていない顔を保存対象から外す
- 保存後にdescriptorインデックスを再読み込みする
- 学習状況をメンバーごとに確認する

学習画面では精度を優先し、顔が小さすぎるものや検出スコアが低いものは保存対象から外します。判定画面よりも保守的に扱うことで、学習データの品質を維持します。

#### 仕分け画面 `sort.html`

仕分け画面は、協力者がブログ画像から顔データを登録するための簡易画面です。

できること:

- ブログ画像をランダムに表示する
- 顔ごとにメンバーを割り当てる
- 事前推論が正しければ効率的に次へ進む
- 間違っている顔だけ修正して登録する
- 顔が検出できない画像を自動スキップする
- 登録件数が少ないメンバーの画像を出しやすくする

仕分け画面は操作数を減らすため、戻る、登録、スキップを中心に構成しています。協力者が短時間でも学習データ作成に参加しやすいようにしています。

### 使用方法

#### 1. 判定する

1. `index.html` を開く
2. 「画像を選択」から画像を選ぶ
3. 顔検出が終わるまで待つ
4. 顔ごとの候補、信頼度、切り抜きを確認する
5. 必要に応じてフレーム表示を切り替える

複数画像を選択した場合は、選択順に解析されます。

#### 2. 学習データを登録する

1. `train.html` を開く
2. ログイン状態を確認する
3. ブログ画像、アップロード、URLのいずれかを選ぶ
4. 検出された顔ごとにメンバーを選択する
5. 登録しない顔は未設定またはスキップにする
6. 登録ボタンでdescriptorを保存する

保存されるのは画像そのものではなく、顔認識モデルが生成した128次元descriptorです。

#### 3. ブログ画像を仕分ける

1. `sort.html` を開く
2. 表示された画像の顔を確認する
3. 事前推論が正しければそのまま進む
4. 間違っていれば顔ごとにメンバーを修正する
5. 登録またはスキップする

仕分け画面では、登録件数が少ないメンバーのブログ画像がやや出やすくなるように重み付けしています。

### ディレクトリ構成

```text
.
├── index.html
├── train.html
├── sort.html
├── app.js
├── train.js
├── sort.js
├── matcher.js
├── api.php
├── style.css
├── data/
│   ├── descriptors.json
│   └── stats.json
├── assets/
│   ├── astra-logo.jpg
│   └── astra-logo.png
├── icon/
│   ├── favicon.ico
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png
│   └── site.webmanifest
└── uploads/
    └── train/
```

### ファイルの役割

```text
index.html   判定画面のHTML
train.html   学習画面のHTML
sort.html    仕分け画面のHTML
app.js       判定画面の処理
train.js     学習画面の処理
sort.js      仕分け画面の処理
matcher.js   descriptor照合インデックス
api.php      JSON API、保存、統計、認証、画像プロキシ
style.css    共通UIスタイル
```

### 使用技術

#### フロントエンド

- HTML
- CSS
- JavaScript
- Canvas API
- File API
- Blob URL
- `createImageBitmap`
- `requestAnimationFrame`

画像はブラウザ上で読み込まれ、必要に応じてCanvas上で解析用サイズに正規化されます。顔の切り抜きもCanvasで生成します。

#### 顔認識

- `@vladmandic/face-api`
- `ssdMobilenetv1`
- `faceLandmark68Net`
- `faceRecognitionNet`

`ssdMobilenetv1` で顔領域を検出し、`faceLandmark68Net` で顔ランドマークを推定し、`faceRecognitionNet` で顔descriptorを生成します。

#### バックエンド

- PHP
- JSONファイル保存
- `flock` によるファイルロック
- PDO
- Cookie / Headerベースのセッショントークン
- 外部画像プロキシ

データベースは認証確認に使用します。顔descriptorと統計はJSONファイルとして保存します。

#### UI

- Google Fonts `Zen Maru Gothic`
- Font Awesome
- Tailwind CDN
- 独自CSS

UIは白背景、細い罫線、コンパクトなパネル、丸みのあるボタン、控えめなピンクアクセントを中心に構成しています。

### ライブラリ

#### `@vladmandic/face-api`

顔検出、ランドマーク抽出、顔特徴量生成に使用します。

使用しているネットワーク:

```text
ssdMobilenetv1
faceLandmark68Net
faceRecognitionNet
```

モデルURL:

```text
https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model
```

#### Font Awesome

画面内の補助アイコンに使用します。

例:

- 画像選択
- 判定
- 学習
- 仕分け
- フィルター
- 閉じるボタン

#### Google Fonts

`Zen Maru Gothic` を使用します。ウェイトは300、400、500、700を読み込んでいます。

#### Tailwind CDN

一部の基本ユーティリティと初期表示補助のために読み込んでいます。主要なレイアウトと見た目は `style.css` で定義しています。

### 独自技術

#### ASTRA descriptor index

`matcher.js` は、登録済みdescriptorを高速かつ安定して照合するためのメモリ上インデックスを構築します。

処理の概要:

1. `data/descriptors.json` を読み込む
2. メンバーごとのdescriptor配列を検証する
3. 128次元の `Float32Array` に変換する
4. 近すぎる重複descriptorを圧縮する
5. メンバーごとの代表descriptorを作る
6. 代表descriptorで候補メンバーを絞る
7. 上位候補だけ元のdescriptorで再評価する
8. 距離順に候補を返す

この方式により、登録データが増えても全descriptorを毎回単純総当たりする必要が少なくなります。代表descriptorで探索範囲を縮め、その後に元データで精査するため、速度と精度のバランスを取りやすくなります。

#### 代表descriptor生成

メンバーごとに最大数を決めて代表descriptorを作ります。代表点は単純な平均だけではなく、descriptor空間でばらつきを拾えるように選択します。

主な処理:

- descriptorの重複除去
- centroid算出
- centroidに近いdescriptorの選択
- 選択済み代表点から遠いdescriptorの追加
- クラスタごとの近傍descriptorへの再調整

これにより、正面、斜め、髪型差、照明差などのばらつきをある程度保持したまま比較数を抑えます。

#### ロバスト距離

単一の最近傍descriptorだけを見ると、外れ値や偶然近いデータに引っ張られる可能性があります。ASTRAでは、近い複数descriptorの距離を使って安定した距離を計算します。

考慮する要素:

- 最短距離
- 近傍descriptorの平均距離
- 最短距離と平均距離の差
- 近傍のまとまり具合

少数データの場合は外れ値の影響を抑えるため、近い1〜2件を重視します。十分な件数がある場合は、上位近傍のまとまりを見ます。

#### 一意割り当て

学習画面と仕分け画面では、複数の顔が同じメンバーとして自動入力されにくいように、顔ごとの候補を距離順に並べ、同じメンバーが重複しないように割り当てます。

これにより、複数人画像で同じメンバーが複数の顔に入る誤推定を減らします。

#### 品質フィルタ

学習データの品質を保つため、学習・仕分けでは次のような顔を保存対象外にします。

- 顔が小さすぎる
- 検出スコアが低い
- 顔領域の比率が小さい
- descriptorは取れているが学習対象として不安定

一方、判定画面では結果表示を優先し、品質が低めでも参考候補を出します。

### データ構造

#### `data/descriptors.json`

メンバー名をキーにして、descriptor行の配列を保存します。

```json
{
  "member name": [
    {
      "id": "descriptor id",
      "descriptor": [0.0123, -0.0456],
      "source": "blog",
      "source_url": "https://example.com/image.jpg",
      "blog_link": "https://example.com/blog",
      "blog_date": "2026/01/01",
      "blog_member": "member name",
      "created_at": "2026-01-01T00:00:00+00:00"
    }
  ]
}
```

`descriptor` は実際には128個の数値を持ちます。保存時には小数を丸め、JSONサイズと比較安定性のバランスを取ります。

#### `data/stats.json`

統計データを保存します。

```json
{
  "member name": {
    "count": 120,
    "updated_at": "2026-01-01T00:00:00+00:00"
  }
}
```

統計は `api.php?action=stats` でdescriptorから再構築できます。

#### 共有マスターデータ

ASTRAは次のファイルを同梱しません。

```text
../data/member.json
../data/blogs.json
```

`member.json` はメンバー名、プロフィール、画像URLなどを持つ想定です。`blogs.json` はブログ本文に紐づく画像URL、投稿者、日付、タイトルなどを持つ想定です。

### API仕様

APIエンドポイントは `api.php` に集約しています。`action` パラメータで処理を切り替えます。

#### `auth_me`

ログイン中のユーザー情報を返します。

```text
GET api.php?action=auth_me
```

用途:

- 学習画面の管理者確認
- 仕分け画面のログイン確認

#### `descriptors`

保存済みdescriptorを返します。

```text
GET api.php?action=descriptors
```

用途:

- 判定画面の照合データ読み込み
- 学習・仕分け画面の事前推論
- 保存後のインデックス再構築

#### `stats`

メンバーごとの登録件数と最終更新日時を返します。

```text
GET api.php?action=stats
```

用途:

- 学習状況表示
- 登録件数が少ないメンバーの補正
- 仕分け対象の重み付け

#### `save_descriptor`

顔descriptorを保存します。

```text
POST api.php?action=save_descriptor
Content-Type: application/json
```

主なpayload:

```json
{
  "member": "member name",
  "descriptor": [0.0123, -0.0456],
  "source": "blog",
  "source_url": "https://example.com/image.jpg",
  "blog_link": "https://example.com/blog",
  "blog_date": "2026/01/01",
  "blog_member": "member name"
}
```

`descriptor` は128次元配列である必要があります。

#### `delete_descriptors`

descriptor IDを指定して削除します。

```text
POST api.php?action=delete_descriptors
Content-Type: application/json
```

payload:

```json
{
  "ids": ["descriptor id"]
}
```

#### `proxy_image`

外部画像を取得して返します。

```text
GET api.php?action=proxy_image&url=https%3A%2F%2Fexample.com%2Fimage.jpg
```

用途:

- CORS制限がある画像の読み込み
- ブログ画像やURL指定画像の解析

制限:

- `http` または `https` のみ許可
- 最大取得サイズは8MB
- MIME typeが画像であることを確認
- リダイレクトは最大3回

### 認証と権限

ASTRAはCookieまたはHeaderからセッショントークンを読み取り、DB上のセッションと照合します。

利用できるトークン入力:

```text
Cookie
Authorization Header
X-Session-Token Header
```

DB設定ファイルの解決順:

```text
ASTRA_AUTH_CONFIG
../api/config.php
../../../../api/config.php
```

権限:

```text
index.html  認証不要
train.html  管理者のみ
sort.html   ログインユーザー
```

保存APIの扱い:

- `source` が `sort` の保存はログインユーザーに許可
- それ以外の保存は管理者のみ許可
- 未ログインの場合は401
- 権限不足の場合は403

### デザイン仕様

ASTRAのUIは、軽量で視認性の高いツール画面を目指しています。

主な方針:

- 白背景
- 細い境界線
- コンパクトなパネル
- 丸みのある操作ボタン
- 控えめなピンクアクセント
- モバイルで操作しやすい下部操作バー
- 顔画像と選択UIの一対一対応
- 長いブログタイトルやファイル名の折り返し

ブランド要素:

- `assets/astra-logo.png`
- `assets/astra-logo.jpg`
- `icon/favicon.ico`
- `icon/apple-touch-icon.png`
- `icon/site.webmanifest`

### デプロイ

共有データディレクトリを使うため、次のような配置を想定しています。

```text
web-root/
├── ASTRA/
│   ├── index.html
│   ├── train.html
│   ├── sort.html
│   ├── api.php
│   └── data/
│       ├── descriptors.json
│       └── stats.json
├── data/
│   ├── member.json
│   └── blogs.json
└── api/
    └── config.php
```

確認ポイント:

- `/ASTRA/index.html` が開ける
- `/data/member.json` が取得できる
- `/data/blogs.json` が取得できる
- `/ASTRA/api.php?action=descriptors` がJSONを返す
- `/ASTRA/api.php?action=stats` がJSONを返す
- 学習・仕分け画面でログイン確認が動く

ローカル確認例:

```bash
php -S 127.0.0.1:8000
```

親ディレクトリをWebルートにして起動すると、`/ASTRA` と `/data` の相対関係を確認できます。

## Details English

### Concept

ASTRA is a lightweight web application for handling the full face-recognition workflow: detect a face, convert it into a descriptor, compare it with collected data, show candidates, and collect corrected training data.

Design principles:

- Run face detection and descriptor extraction in the browser
- Keep the server focused on descriptor storage, statistics, authentication, and image proxying
- Store 128-dimensional face descriptors instead of original face images
- Separate master data from recognition training data
- Return candidates aggressively on the recognition page
- Keep training and sorting conservative to avoid low-quality data
- Use simple JSON files for easier operation and inspection

### Features

- Image-based face recognition
- Batch recognition for multiple images
- Per-face candidate display for multi-person images
- Optional detection frame overlay
- Face crop previews
- Candidate display even for smaller or ambiguous faces
- Face descriptor registration
- Training-data creation from blog images
- Sorting-only workflow for collaborators
- Pre-filled candidates from prior inference
- Efficient training mode for accepting correct predictions
- Per-face skip controls
- Training statistics by member
- External image proxy
- Permission control for training and sorting pages

### Pages

```text
index.html  recognition page
train.html  training page
sort.html   sorting-only page
```

#### Recognition page `index.html`

The recognition page is for selecting images and reviewing member candidates.

Capabilities:

- Select one or multiple images
- Detect all faces in each image
- Display member candidates and confidence per face
- Show face crops
- Toggle detection frames on the image
- Provide reference candidates even for small or ambiguous faces

The recognition page prioritizes returning a useful candidate. Even when a face is small, detection confidence is low, or the first and second candidates are close, ASTRA can still show a reference candidate if the descriptor distance is within an acceptable range.

#### Training page `train.html`

The training page is for collecting high-quality descriptors.

Input sources:

- Blog images
- Uploaded images
- Direct image URLs

Capabilities:

- Assign a member to each detected face
- Skip individual faces
- Review and correct pre-filled predictions
- Exclude unchanged predictions in efficient training mode
- Reload the descriptor index after saving
- Review training statistics by member

The training page is more conservative than the recognition page. Faces that are too small or have low detection confidence are excluded from saving to keep the collected data stable.

#### Sorting page `sort.html`

The sorting page is a simplified workflow for adding descriptors from blog images.

Capabilities:

- Show randomized blog images
- Assign members per detected face
- Move forward quickly when predictions are correct
- Correct only the faces that are wrong
- Automatically skip images where no face is detected
- Weight images toward members with fewer collected descriptors

The sorting page is built around a minimal action set: back, register, and skip.

### Usage

#### 1. Recognize members

1. Open `index.html`
2. Choose one or more images
3. Wait for face detection and descriptor matching
4. Review candidates, confidence values, and face crops
5. Toggle frame display if needed

When multiple files are selected, ASTRA analyzes them sequentially.

#### 2. Register training data

1. Open `train.html`
2. Confirm login and permission state
3. Choose blog image mode, upload mode, or URL mode
4. Assign members to detected faces
5. Leave unrelated faces unset or mark them as skipped
6. Save descriptors

ASTRA stores the generated 128-dimensional descriptors, not the original images.

#### 3. Sort blog images

1. Open `sort.html`
2. Review the displayed image
3. Accept the prediction if it is correct
4. Correct member assignments if needed
5. Register or skip the image

The sorting workflow gives more opportunities to members with fewer registered descriptors.

### Directory Structure

```text
.
├── index.html
├── train.html
├── sort.html
├── app.js
├── train.js
├── sort.js
├── matcher.js
├── api.php
├── style.css
├── data/
│   ├── descriptors.json
│   └── stats.json
├── assets/
│   ├── astra-logo.jpg
│   └── astra-logo.png
├── icon/
│   ├── favicon.ico
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png
│   └── site.webmanifest
└── uploads/
    └── train/
```

### File Responsibilities

```text
index.html   recognition page markup
train.html   training page markup
sort.html    sorting page markup
app.js       recognition page logic
train.js     training page logic
sort.js      sorting page logic
matcher.js   descriptor matching index
api.php      JSON API, storage, stats, authentication, image proxy
style.css    shared UI styles
```

### Technologies

#### Frontend

- HTML
- CSS
- JavaScript
- Canvas API
- File API
- Blob URL
- `createImageBitmap`
- `requestAnimationFrame`

Images are loaded in the browser and normalized for analysis when needed. Face crops are also rendered through Canvas.

#### Face Recognition

- `@vladmandic/face-api`
- `ssdMobilenetv1`
- `faceLandmark68Net`
- `faceRecognitionNet`

ASTRA detects face boxes with `ssdMobilenetv1`, extracts landmarks with `faceLandmark68Net`, and generates face descriptors with `faceRecognitionNet`.

#### Backend

- PHP
- JSON file storage
- `flock` file locking
- PDO
- Cookie/Header based session tokens
- External image proxy

The database is used for authentication checks. Descriptors and statistics are stored as JSON files.

#### UI

- Google Fonts `Zen Maru Gothic`
- Font Awesome
- Tailwind CDN
- Custom CSS

The main visual system is defined in `style.css`.

### Libraries

#### `@vladmandic/face-api`

Used for face detection, facial landmark extraction, and descriptor generation.

Networks:

```text
ssdMobilenetv1
faceLandmark68Net
faceRecognitionNet
```

Model URL:

```text
https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model
```

#### Font Awesome

Used for small interface icons such as image selection, recognition, training, sorting, filtering, and close buttons.

#### Google Fonts

ASTRA uses `Zen Maru Gothic` with weights 300, 400, 500, and 700.

#### Tailwind CDN

Loaded for lightweight utility support. Most layout and component styling is defined in `style.css`.

### ASTRA-specific Matching Technology

#### ASTRA descriptor index

`matcher.js` builds an in-memory descriptor index for faster and more stable matching.

Pipeline:

1. Load `data/descriptors.json`
2. Validate descriptor arrays per member
3. Convert descriptors into 128-dimensional `Float32Array` values
4. Compact near-duplicate descriptors
5. Build representative descriptors per member
6. Narrow member candidates using representative descriptors
7. Refine only the top candidates using the original descriptors
8. Return candidates sorted by distance

This avoids a full naive comparison against every descriptor on every query. Representative descriptors reduce the candidate space, while refinement with the original data preserves accuracy.

#### Representative descriptors

ASTRA creates a limited number of representative descriptors for each member.

Main steps:

- Remove near-duplicate descriptors
- Compute a centroid
- Select the descriptor nearest to the centroid
- Add descriptors far from existing representatives
- Recenter representatives using local clusters

This preserves variation such as angle, expression, hair style, and lighting while reducing comparison cost.

#### Robust distance

Using only the single nearest descriptor can overreact to noisy or accidental matches. ASTRA combines multiple signals:

- nearest distance
- average distance of nearby descriptors
- gap between nearest distance and neighborhood average
- local consistency of nearby descriptors

For small descriptor sets, ASTRA focuses on the nearest one or two descriptors to avoid outlier influence. For larger descriptor sets, it evaluates the compactness of several close descriptors.

#### Unique assignment

On training and sorting pages, ASTRA tries to avoid assigning the same member to multiple faces in the same image. It sorts face proposals by distance and assigns candidates while preventing duplicate member use.

This reduces repeated placeholder assignments in multi-person images.

#### Quality filtering

Training and sorting pages avoid saving unstable descriptors.

Excluded examples:

- faces that are too small
- low detection confidence
- very small face ratio in the image
- descriptors generated from visually unstable face detections

The recognition page is intentionally more permissive and may still show a reference candidate.

### Data Structures

#### `data/descriptors.json`

Descriptors are grouped by member name.

```json
{
  "member name": [
    {
      "id": "descriptor id",
      "descriptor": [0.0123, -0.0456],
      "source": "blog",
      "source_url": "https://example.com/image.jpg",
      "blog_link": "https://example.com/blog",
      "blog_date": "2026/01/01",
      "blog_member": "member name",
      "created_at": "2026-01-01T00:00:00+00:00"
    }
  ]
}
```

The actual `descriptor` array contains 128 numbers.

#### `data/stats.json`

Stores descriptor counts and update timestamps.

```json
{
  "member name": {
    "count": 120,
    "updated_at": "2026-01-01T00:00:00+00:00"
  }
}
```

Statistics can be rebuilt from descriptors through `api.php?action=stats`.

#### Shared master data

ASTRA does not store the following master files:

```text
../data/member.json
../data/blogs.json
```

`member.json` is expected to contain names, profile data, and image URLs. `blogs.json` is expected to contain image URLs, author names, dates, titles, and blog links.

### API

All API actions are handled by `api.php` through the `action` parameter.

#### `auth_me`

Returns the current logged-in user.

```text
GET api.php?action=auth_me
```

Used by:

- training-page permission check
- sorting-page login check

#### `descriptors`

Returns stored descriptors.

```text
GET api.php?action=descriptors
```

Used by:

- recognition matching
- pre-filled predictions
- index rebuild after saving

#### `stats`

Returns descriptor count and latest update timestamp by member.

```text
GET api.php?action=stats
```

Used by:

- training statistics
- low-count member weighting
- sorting priority adjustment

#### `save_descriptor`

Saves a face descriptor.

```text
POST api.php?action=save_descriptor
Content-Type: application/json
```

Payload:

```json
{
  "member": "member name",
  "descriptor": [0.0123, -0.0456],
  "source": "blog",
  "source_url": "https://example.com/image.jpg",
  "blog_link": "https://example.com/blog",
  "blog_date": "2026/01/01",
  "blog_member": "member name"
}
```

The descriptor must contain 128 numeric values.

#### `delete_descriptors`

Deletes descriptors by ID.

```text
POST api.php?action=delete_descriptors
Content-Type: application/json
```

Payload:

```json
{
  "ids": ["descriptor id"]
}
```

#### `proxy_image`

Fetches and returns an external image.

```text
GET api.php?action=proxy_image&url=https%3A%2F%2Fexample.com%2Fimage.jpg
```

Limits:

- only `http` and `https`
- maximum image size: 8 MB
- image MIME type required
- up to 3 redirects

### Authentication and Permissions

ASTRA reads session tokens from Cookie or Headers.

Accepted token sources:

```text
Cookie
Authorization Header
X-Session-Token Header
```

Database configuration lookup order:

```text
ASTRA_AUTH_CONFIG
../api/config.php
../../../../api/config.php
```

Permission model:

```text
index.html  no login required
train.html  administrator only
sort.html   logged-in user
```

Save rules:

- saves from sorting workflow are allowed for logged-in users
- other training saves require administrator permission
- unauthenticated requests return 401
- unauthorized requests return 403

### Design

ASTRA aims to feel like a compact, focused tool rather than a landing page.

Visual principles:

- white background
- light borders
- compact panels
- rounded action buttons
- restrained pink accent
- mobile-friendly bottom action bar
- one-to-one pairing of face crop and member selector
- wrapping support for long titles and filenames

Brand assets:

- `assets/astra-logo.png`
- `assets/astra-logo.jpg`
- `icon/favicon.ico`
- `icon/apple-touch-icon.png`
- `icon/site.webmanifest`

### Deployment

ASTRA expects the shared master data directory to exist beside the ASTRA directory.

```text
web-root/
├── ASTRA/
│   ├── index.html
│   ├── train.html
│   ├── sort.html
│   ├── api.php
│   └── data/
│       ├── descriptors.json
│       └── stats.json
├── data/
│   ├── member.json
│   └── blogs.json
└── api/
    └── config.php
```

Checklist:

- `/ASTRA/index.html` is reachable
- `/data/member.json` is reachable
- `/data/blogs.json` is reachable
- `/ASTRA/api.php?action=descriptors` returns JSON
- `/ASTRA/api.php?action=stats` returns JSON
- training and sorting pages can check login state

Local example:

```bash
php -S 127.0.0.1:8000
```

Start the server from the parent web-root directory to test the relationship between `/ASTRA` and `/data`.
