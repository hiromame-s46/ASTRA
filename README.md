# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** は **Adaptive Sakurazaka Technology Recognition Architecture** の略称です。

## 概要 日本語

ASTRAは、SakuLaboのAI顔認識機能を独立させた、櫻坂46メンバー向けの顔認識・学習支援ツールです。画像内の顔を検出し、学習済みの顔descriptorからメンバー候補を推定します。

現在のAIモデル構成はSakuLabo時代のものを維持し、`@vladmandic/face-api` を使ったブラウザ上での顔検出・顔特徴量抽出・照合を行います。ASTRA側には顔認識モデル周辺のUI、API、収集済みdescriptor、統計データ、ロゴ・アイコンのみを保持します。

メンバー情報やブログ画像リストなどのマスターデータは、従来通り共有の `../data` フォルダを参照します。これにより、ASTRAは顔認識に必要な収集データに集中しつつ、SakuLabo側のデータ更新と整合しやすい構成になっています。

## Overview English

**ASTRA** stands for **Adaptive Sakurazaka Technology Recognition Architecture**.

ASTRA is a standalone face-recognition and training assistant migrated from the SakuLabo AI feature set. It detects faces in uploaded or blog-derived images and estimates Sakurazaka46 member candidates from collected face descriptors.

The current model flow is intentionally kept close to the original SakuLabo implementation. ASTRA uses `@vladmandic/face-api` in the browser for face detection, facial landmark extraction, descriptor generation, and matching. The ASTRA repository stores the recognition UI, API, collected descriptors, local statistics, and ASTRA branding assets.

Member profiles and blog image master data are not duplicated in this repository. They are read from the shared sibling `../data` directory, preserving the existing SakuLabo data layout while keeping ASTRA focused on AI recognition data.

## 詳細 日本語

### 主な機能

- 画像アップロードによる顔判定
- 複数画像の一括判定
- 1枚の画像に複数人が写っている場合の顔ごとの判定
- 画像上の検出フレーム表示切り替え
- 顔の切り抜き表示
- 学習用ページでの顔descriptor登録
- ブログ画像を使った学習・仕分け支援
- 協力者向けの仕分け専用画面
- 登録件数や更新日を確認する学習状況表示
- 既存 `data/descriptors.json` との互換性維持

### 画面構成

```text
index.html  判定画面
train.html  学習画面
sort.html   仕分け専用画面
```

`index.html` は認証なしで画像判定を行うメイン画面です。小さい顔や曖昧な顔でも、可能な限り参考候補を表示するように調整しています。

`train.html` は管理者向けの学習画面です。ブログ画像、アップロード画像、URL指定画像から顔を検出し、顔ごとにメンバーを割り当ててdescriptorを保存します。

`sort.html` は協力者向けの仕分け画面です。ブログ画像からランダムに画像を表示し、顔ごとにメンバーを指定して学習データを追加します。

### 技術構成

ASTRAはフレームワークを使わない静的HTML、JavaScript、CSS、PHP APIで構成されています。

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
└── icon/
    ├── favicon.ico
    ├── favicon-16x16.png
    ├── favicon-32x32.png
    ├── apple-touch-icon.png
    └── site.webmanifest
```

### 使用ライブラリ

- `@vladmandic/face-api`
  - `ssdMobilenetv1`
  - `faceLandmark68Net`
  - `faceRecognitionNet`
- Font Awesome
- Google Fonts `Zen Maru Gothic`
- Tailwind CDN

モデルファイルは `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model` から読み込みます。

### 顔認識の流れ

1. 画像を読み込む
2. `ssdMobilenetv1` で顔を検出する
3. `faceLandmark68Net` でランドマークを抽出する
4. `faceRecognitionNet` で128次元descriptorを生成する
5. `matcher.js` の `SakuFaceIndex` で登録済みdescriptorと照合する
6. 最も近いメンバー候補と次点候補の距離差を見て判定を出す

`matcher.js` は全descriptorを単純総当たりするのではなく、メンバーごとに代表descriptorを作って候補を絞り、その後に上位候補だけを既存descriptorで精査します。既存データ形式は変更せず、速度と精度のバランスを取るためのメモリ上インデックスとして動作します。

### データ方針

ASTRAリポジトリが保持するデータは、顔認識のために収集したデータに限定します。

```text
data/descriptors.json  顔descriptor
data/stats.json        登録件数・更新日時などの統計
```

次のマスターデータはASTRA内に保持しません。

```text
../data/member.json
../data/blogs.json
```

`train.js` と `sort.js` は、共有データとして `../data/member.json` と `../data/blogs.json` を参照します。

### API

`api.php` は以下のactionを提供します。

```text
auth_me             ログインユーザー確認
descriptors         descriptor一覧取得
stats               学習統計取得
save_descriptor     descriptor保存
delete_descriptors  descriptor削除
proxy_image         外部画像プロキシ
```

descriptor保存時は、既存のSakuLabo/Buddies profileログインセッションと互換性のある認証を使います。`sort` 由来の保存はログインユーザーであれば許可し、通常の学習保存は管理者ユーザーのみ許可する設計です。

### 認証

ASTRAの認証は既存の `sakulabo_token` Cookie、`Authorization` Header、または `X-Session-Token` Header を利用します。DB接続設定は以下の優先順で読み込みます。

```text
ASTRA_AUTH_CONFIG
../api/config.php
../../../../api/config.php
```

環境変数 `ASTRA_AUTH_CONFIG` を指定すると、配置先に合わせて認証DB設定ファイルを差し替えられます。

### デザイン

ASTRAのUIは、SakuLabo AIで使っていたクリーンでミニマルな雰囲気を引き継ぎつつ、独立プロジェクトとしてASTRAロゴをヘッダー、favicon、READMEに反映しています。

フォントは `Zen Maru Gothic` を使用し、白背景、細めの罫線、控えめなピンクアクセントを中心に設計しています。

### デプロイメモ

ASTRAを既存のSakuLaboと同じWebルート配下に配置する場合、以下のような構成を想定しています。

```text
web-root/
├── ASTRA/
│   ├── index.html
│   ├── train.html
│   ├── sort.html
│   └── data/
└── data/
    ├── member.json
    └── blogs.json
```

この配置では、ASTRAから `../data/member.json` と `../data/blogs.json` を参照できます。

## Details English

### Key Features

- Face recognition from uploaded images
- Batch recognition for multiple images
- Per-face recognition for images containing multiple people
- Optional detection frame overlay
- Face crop preview
- Descriptor registration on the training page
- Blog-image based training and sorting workflows
- Collaborator-focused sorting page
- Training statistics such as descriptor counts and latest update dates
- Compatibility with the existing `data/descriptors.json` format

### Pages

```text
index.html  recognition page
train.html  training page
sort.html   sorting-only page
```

`index.html` is the main recognition page. It is designed to provide a candidate whenever possible, even for smaller or ambiguous faces.

`train.html` is the administrator-oriented training page. It detects faces from blog images, uploaded files, or direct image URLs, then saves member-labeled descriptors.

`sort.html` is the collaborator-oriented sorting page. It shows blog images and lets users assign members to each detected face for additional training data.

### Technical Architecture

ASTRA is built with plain HTML, JavaScript, CSS, and a PHP API. No frontend framework is required.

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
└── icon/
    ├── favicon.ico
    ├── favicon-16x16.png
    ├── favicon-32x32.png
    ├── apple-touch-icon.png
    └── site.webmanifest
```

### Libraries

- `@vladmandic/face-api`
  - `ssdMobilenetv1`
  - `faceLandmark68Net`
  - `faceRecognitionNet`
- Font Awesome
- Google Fonts `Zen Maru Gothic`
- Tailwind CDN

Model files are loaded from `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model`.

### Recognition Flow

1. Load the image
2. Detect faces with `ssdMobilenetv1`
3. Extract facial landmarks with `faceLandmark68Net`
4. Generate 128-dimensional descriptors with `faceRecognitionNet`
5. Match descriptors against stored training data through `SakuFaceIndex` in `matcher.js`
6. Compare the nearest and second-nearest candidates to produce a recognition result

`matcher.js` builds an in-memory index from existing descriptors. It first narrows the search using representative descriptors for each member, then refines only the top candidates using the original stored descriptors. This keeps the existing JSON format intact while improving matching speed and stability.

### Data Policy

ASTRA stores only recognition-related collected data.

```text
data/descriptors.json  face descriptors
data/stats.json        descriptor counts and update timestamps
```

The following master data files are intentionally not stored in this repository.

```text
../data/member.json
../data/blogs.json
```

`train.js` and `sort.js` read these files from the shared sibling `../data` directory.

### API

`api.php` provides the following actions.

```text
auth_me             get current logged-in user
descriptors         get stored descriptors
stats               get training statistics
save_descriptor     save a descriptor
delete_descriptors  delete descriptors
proxy_image         proxy an external image
```

Saving descriptors uses the existing SakuLabo/Buddies profile compatible login session. Saves from the sorting workflow are allowed for logged-in users, while ordinary training saves are restricted to the administrator account.

### Authentication

ASTRA reads an existing login token from the `sakulabo_token` Cookie, `Authorization` Header, or `X-Session-Token` Header. Database configuration is loaded in the following order.

```text
ASTRA_AUTH_CONFIG
../api/config.php
../../../../api/config.php
```

Set `ASTRA_AUTH_CONFIG` when the deployment path requires a custom authentication database config.

### Design

ASTRA inherits the clean, minimal visual language of the original SakuLabo AI UI while adding ASTRA-specific branding. The ASTRA logo is used in the header, favicon assets, app manifest, and README.

The interface uses `Zen Maru Gothic`, a white background, light borders, compact controls, and a restrained pink accent.

### Deployment Notes

When ASTRA is deployed under the same web root as the shared data directory, the expected layout is:

```text
web-root/
├── ASTRA/
│   ├── index.html
│   ├── train.html
│   ├── sort.html
│   └── data/
└── data/
    ├── member.json
    └── blogs.json
```

With this layout, ASTRA can read `../data/member.json` and `../data/blogs.json` correctly.
