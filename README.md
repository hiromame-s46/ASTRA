# ASTRA

![ASTRA logo](assets/astra-logo.png)

**ASTRA** は **Adaptive Scalable Training Recognition Architecture** の略称です。

名前の由来はそのままに、ASTRA は特定のコミュニティだけに閉じない、小規模コミュニティ向けの顔認識・学習データ整理OSSとして設計されています。

## 概要 日本語

ASTRAは、小規模コミュニティ向けに設計した、ブラウザベースの顔認識・学習データ整理OSSです。画像内の顔を検出し、収集済みの顔特徴量データと照合して、顔ごとに人物候補を表示します。

主な用途は、画像からの人物推定、複数人画像の顔ごとの判定、顔特徴量データの登録、コミュニティ内で共有される画像を使った学習データ整理です。判定画面はシンプルに画像を選んで結果を見る構成にし、学習画面と仕分け画面ではデータ収集を効率化するための操作に集中できるようにしています。

ASTRAは、顔認識モデル、照合ロジック、収集データ、学習統計、API、UI、ブランドアセットを1つの独立したプロジェクトとしてまとめています。一方で、人物情報や画像一覧のようなマスターデータはASTRA内に複製せず、共有の `../data` ディレクトリを参照します。これにより、ASTRAはAI判定と学習データ管理に専念できます。

## Overview English

**ASTRA** stands for **Adaptive Scalable Training Recognition Architecture**.

The original acronym is preserved, while ASTRA is written and structured as open-source software for browser-based face recognition and training-data organization in small communities.

ASTRA is a browser-based face recognition and training-data organization OSS designed for small communities. It detects faces in images, compares each detected face against collected facial descriptor data, and displays person candidates for each face.

Its core use cases are person recognition from images, per-face recognition in multi-person images, facial descriptor registration, and training-data organization using community image sources. The recognition page is intentionally simple: choose images and review the results. The training and sorting pages focus on efficient data collection and correction workflows.

ASTRA is organized as an independent project containing the recognition model flow, matching logic, collected training data, statistics, API, UI, and brand assets. Person profiles and image master data are not duplicated inside ASTRA; they are loaded from the shared `../data` directory. This keeps ASTRA focused on AI recognition and training-data management.

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
- 協力者向けのアップロード画像学習画面
- 事前推論によるメンバー候補の自動入力
- 推論が正しい場合の効率学習モード
- 顔ごとのスキップ指定
- 登録件数や最終更新日を表示する学習統計
- 外部画像取得用の画像プロキシ
- ログイン状態に応じた学習・仕分け権限制御
- Sort利用者の個別許可、一時停止、全員解放モード
- 画像学習利用者の個別許可、一時停止、全員解放モード

### 画面

```text
index.html  判定画面
train.html  学習画面
sort.html   仕分け専用画面
train-image.html  協力者向け画像学習画面
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

#### 画像学習画面 `train-image.html`

画像学習画面は、協力者がブログなどの共有キューに依存せず、手元の画像からdescriptorを登録するための画面です。画像ファイル本体は保存せず、ブラウザ内で顔検出とdescriptor生成を行い、保存APIには学習データだけを送信します。

できること:

- 複数のローカル画像を選択する
- 顔ごとにメンバーを割り当てる
- 事前推論が正しければ効率的に登録する
- 顔ごとにスキップする
- Sortとは別の画像学習権限で利用者を制御する

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

仕分け画面では、登録件数が少ない対象メンバーのブログ画像が優先的に出やすくなるように重み付けしています。登録件数10件以下、30件以下、50件以下の段階に分け、少ない段階ほど高い確率で表示されます。

#### 4. 任意画像から学習データを登録する

1. `train-image.html` を開く
2. ログイン状態と画像学習権限を確認する
3. ローカル画像を1枚または複数枚選ぶ
4. 検出された顔ごとにメンバーを選択する
5. 登録しない顔は未設定またはスキップにする
6. 登録ボタンでdescriptorを保存する

画像ファイルそのものは保存されません。保存されるのは、顔認識モデルが生成した128次元descriptorと選択されたメンバー情報です。

### ディレクトリ構成

```text
.
├── index.html
├── train.html
├── sort.html
├── train-image.html
├── app.js
├── train.js
├── sort.js
├── train-image.js
├── matcher.js
├── api.php
├── style.css
├── data/
│   ├── descriptors.json
│   ├── stats.json
│   ├── sort_access.json
│   └── image_access.json
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
train-image.html  協力者向け画像学習画面のHTML
app.js       判定画面の処理
train.js     学習画面の処理
sort.js      仕分け画面の処理
train-image.js  協力者向け画像学習画面の処理
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
- サーバー側セッション検証
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

#### 効率学習モード

効率学習モードは、事前推論の結果を学習操作に直接つなげるための仕組みです。画像を表示する前に現在のdescriptorインデックスで推論し、顔ごとの選択欄に候補を反映します。協力者は、正しい推論であればそのまま次へ進み、誤っている顔だけを修正して登録できます。

このモードでは、推論結果と人間の選択が変わっていない顔を原則として保存対象から外します。ただし登録件数が少ないメンバーについては、正解確認そのものにも学習価値があるため、一定件数以下では正解時にも保存できるようにしています。これにより、すでに十分なデータがあるメンバーへの過剰登録を抑えながら、データが薄いメンバーを補強できます。

#### 段階的Sort優先キュー

仕分け画面では、ブログ画像を完全な均等ランダムではなく、登録件数に応じた段階的な優先キューで並べます。対象メンバーを基準に、登録数10件以下を第一優先、30件以下を第二優先、50件以下を第三優先とし、それ以外を通常枠として扱います。

各優先枠の中ではランダム性を維持し、同じメンバーや同じブログに偏りすぎないようにします。優先枠同士は重み付きで混ぜるため、少ないメンバーほど出やすい一方で、通常枠の画像も完全には途切れません。この設計は、協力者の作業を単調にしないことと、データ不足の解消を両立するためのものです。

#### Sort権限ゲート

Sortは協力者がdescriptorを登録できる画面であるため、単なる画面表示だけでなく、保存API側でも権限を確認します。権限設定はJSONで管理し、標準では個別許可モードです。管理者はTrain画面から、ユーザーIDを使って利用者を追加、一時停止、削除できます。

また、一時的に広く協力を募るための全員解放モードもあります。このモードでもログインは必須で、未ログインの保存は許可されません。全員解放中も個別リストは保持されるため、必要に応じて個別許可モードへ戻せます。

#### 画像学習権限ゲート

`train-image.html` は協力者が任意画像からdescriptorを登録できる画面であるため、Sortとは別の権限設定で制御します。権限設定は `data/image_access.json` に保存され、標準では個別許可モードです。管理者はTrain画面から、ユーザーIDを使って利用者を追加、一時停止、削除できます。

画像学習にも全員解放モードがあります。このモードでもログインは必須で、未ログインの保存は許可されません。Sort権限とは独立しているため、ブログ仕分けだけを許可する運用、任意画像学習だけを許可する運用、両方を許可する運用を分けられます。

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

#### `data/sort_access.json`

Sort画面の利用権限を管理します。

```json
{
  "mode": "limited",
  "users": {
    "1": {
      "user_id": 1,
      "username": "hiromame",
      "display_name": "hiromame",
      "status": "active",
      "created_at": "",
      "updated_at": ""
    }
  }
}
```

`mode` は `limited` または `all` です。`limited` では `users` に登録された有効ユーザーだけがSortを利用できます。`all` ではログイン済みユーザー全員が利用できます。`status` は `active` または `paused` で、一時停止中のユーザーは個別許可モードでは利用できません。

#### `data/image_access.json`

画像学習画面の利用権限を管理します。構造は `data/sort_access.json` と同じです。

```json
{
  "mode": "limited",
  "users": {
    "1": {
      "user_id": 1,
      "username": "admin",
      "display_name": "Administrator",
      "status": "active",
      "created_at": "",
      "updated_at": ""
    }
  }
}
```

`mode` は `limited` または `all` です。`limited` では `users` に登録された有効ユーザーだけが画像学習画面を利用できます。`all` ではログイン済みユーザー全員が利用できます。

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
- 画像学習画面のログイン確認

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

#### `image_access_me`

画像学習画面のログイン状態と利用可否を返します。

```text
GET api.php?action=image_access_me
```

#### `image_access_list`

画像学習画面の権限設定を返します。管理者のみ利用できます。

```text
GET api.php?action=image_access_list
```

#### `image_access_mode`

画像学習画面の権限モードを切り替えます。管理者のみ利用できます。

```text
POST api.php?action=image_access_mode
Content-Type: application/json
```

Payload:

```json
{
  "mode": "limited"
}
```

#### `image_access_save`

画像学習画面の許可ユーザーを追加または更新します。管理者のみ利用できます。

```text
POST api.php?action=image_access_save
Content-Type: application/json
```

Payload:

```json
{
  "user_id": 1,
  "status": "active"
}
```

#### `image_access_delete`

画像学習画面の許可ユーザーを削除します。管理者のみ利用できます。

```text
POST api.php?action=image_access_delete
Content-Type: application/json
```

Payload:

```json
{
  "user_id": 1
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

ASTRAはログイン済みセッションをサーバー側で検証し、画面表示だけでなく保存APIでも権限を確認します。認証情報や接続設定の具体値はリポジトリに含めず、実行環境側で安全に管理する前提です。

権限:

```text
index.html  認証不要
train.html  管理者のみ
sort.html   ログイン必須、Sort権限設定に従う
train-image.html  ログイン必須、画像学習権限設定に従う
```

保存APIの扱い:

- `source` が `sort` の保存はSort権限を持つログインユーザーのみ許可
- `source` が `image` の保存は画像学習権限を持つログインユーザーのみ許可
- それ以外の保存は管理者のみ許可
- descriptor削除は管理者のみ許可
- 未ログインの場合は401
- 権限不足の場合は403

Sort権限:

- 標準は個別許可モード
- 初期状態では管理者ユーザーのみ有効
- 管理者はTrain画面からユーザーIDで利用者を追加できる
- 利用者ごとに有効、一時停止、削除を切り替えられる
- 全員解放モードでは、ログイン済みユーザー全員がSortを利用できる
- 全員解放モードでも未ログインユーザーは保存できない

画像学習権限:

- 標準は個別許可モード
- 初期状態では管理者ユーザーのみ有効
- 管理者はTrain画面からユーザーIDで利用者を追加できる
- 利用者ごとに有効、一時停止、削除を切り替えられる
- 全員解放モードでは、ログイン済みユーザー全員が画像学習を利用できる
- 全員解放モードでも未ログインユーザーは保存できない
- Sort権限とは独立して管理される

### セキュリティ

ASTRAは顔descriptorを扱うため、通常のWebアプリケーションよりも慎重な運用が必要です。descriptorは画像そのものではありませんが、顔特徴量に由来するデータであり、公開範囲、バックアップ、権限、削除運用を明確にして扱うべきデータです。

実装上の保護:

- APIレスポンスに内部例外の詳細を直接返さない
- JSON APIレスポンスに `no-store` を付ける
- 更新系APIはPOSTのみ受け付ける
- JSON payloadのサイズを制限する
- ログイン応答でセッショントークンを本文に含めない
- CookieはHTTP only、SameSite属性付きで発行する
- descriptor保存時に128次元配列であることを検証する
- descriptor削除は管理者に限定する
- Sort保存はSort権限を持つログインユーザーに限定する
- 画像学習保存は画像学習権限を持つログインユーザーに限定する
- 画像プロキシはHTTP/HTTPSのみを許可する
- 取得サイズと画像MIME typeを確認する

運用上の注意:

- `data/descriptors.json`、`data/stats.json`、`data/sort_access.json`、`data/image_access.json` は直接公開・編集できる場所に置かない
- API経由の読み取りが必要な範囲だけを公開する
- 認証設定、DB接続情報、セッション保存先はリポジトリに含めない
- 本番環境ではHTTPSを使う
- 管理者アカウントは最小限にする
- Sortの全員解放モードは期間を決めて使う
- 画像学習の全員解放モードは期間を決めて使う
- 不要になった権限は一時停止または削除する
- バックアップにはdescriptorが含まれるため、配布先と保管期間を管理する
- 画像プロキシは便利な一方で外部通信を伴うため、ログと利用状況を定期的に確認する
- CDNライブラリを使う場合は、読み込み元やバージョンの変更に注意する

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
│   ├── train-image.html
│   ├── api.php
│   └── data/
│       ├── descriptors.json
│       ├── stats.json
│       ├── sort_access.json
│       └── image_access.json
├── data/
│   ├── member.json
│   ├── member_grad.json
│   └── blogs.json
└── secure-auth-config
```

確認ポイント:

- `/ASTRA/index.html` が開ける
- `/data/member.json` が取得できる
- `/data/blogs.json` が取得できる
- `/ASTRA/api.php?action=descriptors` がJSONを返す
- `/ASTRA/api.php?action=stats` がJSONを返す
- 学習・仕分け画面でログイン確認が動く
- Sort権限モードが想定通りに動く
- 画像学習権限モードが想定通りに動く
- descriptor保存・削除が権限不足で拒否される
- 画像プロキシがHTTP/HTTPS以外を拒否する

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
- Uploaded-image training workflow for collaborators
- Pre-filled candidates from prior inference
- Efficient training mode for accepting correct predictions
- Per-face skip controls
- Training statistics by member
- External image proxy
- Permission control for training and sorting pages
- Individual sorting access, paused users, and public sorting mode
- Individual image-training access, paused users, and public image-training mode

### Pages

```text
index.html  recognition page
train.html  training page
sort.html   sorting-only page
train-image.html  collaborator image-training page
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

#### Image training page `train-image.html`

The image training page lets collaborators register descriptors from local images without relying on the shared blog queue. Original image files are not saved. Images are analyzed in the browser, and only generated descriptors and selected member names are sent to the save API.

Capabilities:

- Choose one or more local images
- Assign members per detected face
- Move forward quickly when predictions are correct
- Skip individual faces
- Control access with a separate image-training access policy

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

The sorting workflow gives more opportunities to target members with fewer registered descriptors. Members with 10 or fewer, 30 or fewer, and 50 or fewer descriptors are handled as separate priority tiers, and lower-count tiers appear more often while retaining randomness.

#### 4. Register training data from arbitrary images

1. Open `train-image.html`
2. Confirm login and image-training permission state
3. Choose one or more local images
4. Assign members to detected faces
5. Leave unrelated faces unset or mark them as skipped
6. Save descriptors

Original image files are not stored. ASTRA stores only generated 128-dimensional descriptors and selected member data.

### Directory Structure

```text
.
├── index.html
├── train.html
├── sort.html
├── train-image.html
├── app.js
├── train.js
├── sort.js
├── train-image.js
├── matcher.js
├── api.php
├── style.css
├── data/
│   ├── descriptors.json
│   ├── stats.json
│   ├── sort_access.json
│   └── image_access.json
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
train-image.html  collaborator image-training page markup
app.js       recognition page logic
train.js     training page logic
sort.js      sorting page logic
train-image.js  collaborator image-training page logic
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
- Server-side session validation
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

On training, sorting, and image-training pages, ASTRA tries to avoid assigning the same member to multiple faces in the same image. It sorts face proposals by distance and assigns candidates while preventing duplicate member use.

This reduces repeated placeholder assignments in multi-person images.

#### Quality filtering

Training, sorting, and image-training pages avoid saving unstable descriptors.

Excluded examples:

- faces that are too small
- low detection confidence
- very small face ratio in the image
- descriptors generated from visually unstable face detections

The recognition page is intentionally more permissive and may still show a reference candidate.

#### Efficient training mode

Efficient training mode connects pre-inference directly to the data collection workflow. Before the user confirms an image, ASTRA runs the current descriptor index and fills member selectors with likely candidates for each detected face. A collaborator can move forward quickly when the prediction is correct, and only change the faces that are wrong.

When the selected member is unchanged from the pre-filled prediction, ASTRA normally avoids saving a duplicate descriptor. However, members with a low descriptor count still benefit from additional confirmed examples, so correct predictions can still be registered below the configured count threshold. This balances two goals: avoiding excessive data for already well-covered members and increasing coverage for sparse members.

#### Tiered sorting priority queue

The sorting workflow does not use a flat random queue. It builds a tiered queue from blog images based on the descriptor count of target members. Members with 10 or fewer descriptors form the first priority tier, 30 or fewer form the second tier, and 50 or fewer form the third tier. All other images remain in the normal tier.

Items inside each tier are shuffled, and tiers are mixed with weights rather than hard ordering. This means low-count members appear more often without making the queue feel deterministic. The goal is to make contributor time more useful while still preserving a varied sorting experience.

#### Sorting access gate

Sorting can create new descriptors, so access is checked on both the page and the API. The access policy is stored as JSON and defaults to individual permission mode. Administrators can add, pause, resume, or delete users from the training page by using their user ID.

ASTRA also supports a public sorting mode for temporary open collaboration. Public mode still requires login; anonymous saves are not accepted. The individual list remains intact while public mode is enabled, so administrators can return to individual permission mode later without rebuilding the list.

#### Image-training access gate

`train-image.html` can create new descriptors from arbitrary local images, so it uses a separate access policy from sorting. The policy is stored in `data/image_access.json` and defaults to individual permission mode. Administrators can add, pause, resume, or delete users from the training page by using their user ID.

ASTRA also supports a public image-training mode for temporary open collaboration. Public mode still requires login; anonymous saves are not accepted. Sorting access and image-training access are independent, so deployments can allow either workflow separately or allow both.

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

#### `data/sort_access.json`

Stores the access policy for the sorting page.

```json
{
  "mode": "limited",
  "users": {
    "1": {
      "user_id": 1,
      "username": "hiromame",
      "display_name": "hiromame",
      "status": "active",
      "created_at": "",
      "updated_at": ""
    }
  }
}
```

`mode` is either `limited` or `all`. In `limited` mode, only active users listed under `users` can use sorting. In `all` mode, every logged-in user can use sorting. User `status` is either `active` or `paused`; paused users cannot use sorting when the mode is limited.

#### `data/image_access.json`

Stores the access policy for the image-training page. The structure matches `data/sort_access.json`.

```json
{
  "mode": "limited",
  "users": {
    "1": {
      "user_id": 1,
      "username": "admin",
      "display_name": "Administrator",
      "status": "active",
      "created_at": "",
      "updated_at": ""
    }
  }
}
```

`mode` is either `limited` or `all`. In `limited` mode, only active users listed under `users` can use image training. In `all` mode, every logged-in user can use image training.

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
- image-training-page login check

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

#### `image_access_me`

Returns the current login state and image-training access result.

```text
GET api.php?action=image_access_me
```

#### `image_access_list`

Returns the image-training access policy. Administrator only.

```text
GET api.php?action=image_access_list
```

#### `image_access_mode`

Updates the image-training access mode. Administrator only.

```text
POST api.php?action=image_access_mode
Content-Type: application/json
```

Payload:

```json
{
  "mode": "limited"
}
```

#### `image_access_save`

Adds or updates an allowed image-training user. Administrator only.

```text
POST api.php?action=image_access_save
Content-Type: application/json
```

Payload:

```json
{
  "user_id": 1,
  "status": "active"
}
```

#### `image_access_delete`

Deletes an allowed image-training user. Administrator only.

```text
POST api.php?action=image_access_delete
Content-Type: application/json
```

Payload:

```json
{
  "user_id": 1
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

ASTRA validates logged-in sessions on the server and checks permissions not only on pages but also on write APIs. Authentication secrets and connection settings are expected to be managed by the runtime environment and are not part of this repository.

Permission model:

```text
index.html  no login required
train.html  administrator only
sort.html   login required, controlled by sorting access policy
train-image.html  login required, controlled by image-training access policy
```

Save rules:

- saves from sorting workflow require a logged-in user with sorting access
- saves from image-training workflow require a logged-in user with image-training access
- other training saves require administrator permission
- descriptor deletion requires administrator permission
- unauthenticated requests return 401
- unauthorized requests return 403

Sorting access:

- default mode is individual permission
- the initial access list contains only the administrator user
- administrators can add users by user ID from the training page
- each user can be active, paused, or deleted
- public sorting mode allows every logged-in user to use sorting
- public sorting mode still rejects anonymous saves

Image-training access:

- default mode is individual permission
- the initial access list contains only the administrator user
- administrators can add users by user ID from the training page
- each user can be active, paused, or deleted
- public image-training mode allows every logged-in user to use image training
- public image-training mode still rejects anonymous saves
- image-training access is managed independently from sorting access

### Security

ASTRA handles face descriptors, so it should be operated with more care than a generic static site. Descriptors are not original images, but they are derived from face data and should be treated as sensitive operational data. Access, backups, deletion, and sharing should be managed deliberately.

Implementation protections:

- API responses do not expose internal exception details
- JSON API responses use `no-store`
- write APIs require POST
- JSON payload sizes are limited
- login responses do not include session tokens in the body
- cookies are issued with HTTP only and SameSite attributes
- descriptor saves validate the 128-dimensional descriptor shape
- descriptor deletion is administrator-only
- sorting saves require sorting access
- image-training saves require image-training access
- the image proxy accepts only HTTP/HTTPS URLs
- downloaded image size and image MIME type are checked

Operational guidance:

- do not expose or manually edit `data/descriptors.json`, `data/stats.json`, `data/sort_access.json`, or `data/image_access.json` outside the intended API flow
- keep authentication and database configuration outside the repository
- use HTTPS in production
- keep the administrator set small
- use public sorting mode only for a defined collaboration period
- use public image-training mode only for a defined collaboration period
- pause or delete access when it is no longer needed
- treat backups containing descriptors as sensitive
- monitor image proxy usage because it performs outbound network requests
- review CDN dependencies and model sources before production use

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
│   ├── train-image.html
│   ├── api.php
│   └── data/
│       ├── descriptors.json
│       ├── stats.json
│       ├── sort_access.json
│       └── image_access.json
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
- training, sorting, and image-training pages can check login state
- sorting access mode behaves as expected
- image-training access mode behaves as expected

Local example:

```bash
php -S 127.0.0.1:8000
```

Start the server from the parent web-root directory to test the relationship between `/ASTRA` and `/data`.

## Final Notes / まとめ

### 日本語

ASTRA は Apache License 2.0 のもとで公開されるオープンソースソフトウェアです。ライセンスの範囲内で、利用、複製、変更、再配布、派生物の作成を行うことができます。詳細な条件はリポジトリ内の `LICENSE` を確認してください。

本リポジトリには、アプリケーション本体、推論・学習ワークフロー、UI、API、サンプル構成に必要なファイルを含めています。一方で、実運用で生成される顔特徴量、統計情報、アクセス制御データ、アップロード画像、認証情報、データベース接続情報、秘密鍵、環境変数などは公開対象に含めない前提です。これらは運用環境ごとに安全に管理してください。

ASTRA は画像内の顔を検出し、登録済みの特徴量と照合するための技術検証および運用支援ツールです。顔特徴量は元画像そのものではありませんが、人物の識別に関わる情報であるため、慎重に取り扱う必要があります。公開リポジトリに実データを含めないこと、バックアップやログの扱いに注意すること、利用者や協力者の権限を適切に管理することを推奨します。

また、本プロジェクトは非公式の独立したソフトウェアです。特定の団体、事務所、権利者、公式サービスによる承認、提携、運営を意味するものではありません。名称、画像、人物情報、外部データを利用する場合は、利用者自身の責任で権利、利用条件、プライバシー、公開範囲を確認してください。

### English

ASTRA is open-source software released under the Apache License 2.0. You may use, copy, modify, redistribute, and create derivative works within the terms of that license. See the `LICENSE` file in this repository for the full license text.

This repository contains the application code, recognition and training workflows, UI, API, and files required for the sample structure. Runtime-generated face descriptors, statistics, access-control data, uploaded images, authentication settings, database connection settings, private keys, environment variables, and other secrets are intentionally not meant to be published with the repository. They should be managed securely in each deployment environment.

ASTRA is a technical and operational tool for detecting faces in images and comparing them with registered descriptors. Face descriptors are not original images, but they are still derived from facial data and should be handled carefully. Do not commit real operational descriptors to a public repository, review backups and logs, and keep user permissions limited to the people who actually need access.

This project is unofficial and independent. It is not endorsed, affiliated with, operated by, or approved by any specific organization, agency, rights holder, or official service. When using names, images, person-related information, or external data sources, users are responsible for confirming the applicable rights, terms of use, privacy considerations, and publication scope.
