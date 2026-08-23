# 動画設計書の正規化スキーマ

工程 P1 で読み込みます。動画設計書を読み取り、以下の構造へ正規化します。

## 目次

1. 正規化スキーマ
2. 列名の同義語辞書
3. 欠損時の扱い
4. 正規化の手順

---

## 1. 正規化スキーマ

| 区分 | 項目 | 必須 | 内容 |
|---|---|---|---|
| meta | repository | 必須 | リポジトリ名です |
| meta | title_candidates | 任意 | 動画タイトル案です |
| meta | edition | 必須 | 設計書側のエディションです |
| meta | production_mode | 必須 | `remotion_only` または `generative` のいずれかです |
| meta | models | 必須 | クリップ・静止画・TTS・編集の各モデルと参照日です |
| constraints | items[] | 必須 | 構成要件です。機械検査対象と目視審査対象に分類して保持します |
| scenes[] | scene_id | 必須 | シーン識別子です |
| scenes[] | duration_sec | 必須 | シーン尺です |
| scenes[] | material_kind | 必須 | `clip` / `figure` / `title_card` のいずれかです |
| scenes[] | material_count | 必須 | 設計書が指定するカット数です |
| scenes[] | visual | 必須 | 映像内容の記述です |
| scenes[] | subtitles[] | 必須 | 字幕行です |
| scenes[] | narration_policy | 必須 | ナレーション方針です |
| scenes[] | intentional_luminance_change | 必須 | 意図的な輝度・色変化を含むかどうかです |
| output_spec | resolution / fps / codec / audio | 必須 | 出力規格です |
| cost_policy | retry_limit / hard_cap | 必須 | カット単位のリトライ上限と課金上限です |
| narration | engine / speaker | 必須 | 合成エンジンと話者です |

`narration.speaker` の指定がない場合の既定は四国めたん（ノーマル）です。指定がある場合は設計書側を優先します。

## 2. 列名の同義語辞書

設計書の見出しと表の列名には揺れがあります。以下の対応で吸収します。表記の全角・半角、大文字・小文字、前後の空白は無視して照合します。

| 正規化後の項目 | 受け付ける列名 |
|---|---|
| scene_id | シーン、シーンID、No、番号、#、Scene |
| duration_sec | 尺、長さ、秒数、時間、Duration |
| material_kind | 種別、素材種別、映像種別、Kind、Type |
| material_count | カット数、素材数、点数、Count |
| visual | 映像、映像内容、画、ビジュアル、Visual |
| subtitles | 字幕、テロップ、Subtitle、Caption |
| narration_policy | ナレーション、読み、語り、Narration |
| intentional_luminance_change | 意図的な輝度変化、輝度変化、演出上の明滅 |
| production_mode | 制作モード、モード、Mode |
| models | 使用モデル、モデル、Models |
| resolution | 解像度、サイズ、Resolution |
| fps | フレームレート、FPS、fps |
| codec | コーデック、Codec |
| audio | 音声、オーディオ、Audio |
| retry_limit | リトライ上限、再生成上限、Retry |
| hard_cap | 課金上限、ハードキャップ、上限額、Cap |
| engine | 合成エンジン、TTS、エンジン |
| speaker | 話者、声、ボイス、Speaker |

同義語辞書に無い列名は、対応が付かないものとして扱います。**似ているという理由で推測して割り当てません。**

## 3. 欠損時の扱い

- 必須項目が抽出できない場合、**推測で補完しません**
- 欠損した項目をすべて列挙し、どのシーンのどの項目かを示して停止します
- 一部のシーンだけが欠損している場合も、全体を停止します。欠損したまま後続の工程へ進みません
- 任意項目の欠損は停止の理由になりません

停止時の出力には、次を含めます。

1. 欠損した項目の一覧（区分・項目名・該当シーン）
2. 設計書側で追記すべき内容
3. 同義語辞書に無い列名が見つかった場合は、その列名

## 4. 正規化の手順

1. 設計書を読み取り、見出しと表を抽出します
2. 列名を同義語辞書で正規化します
3. 必須項目の充足を確認します。不足があれば 3 節に従って停止します
4. `production_mode` を確定します。以降の工程では、この値に応じて `mode-generative.md` と `mode-remotion-only.md` の一方のみを読み込みます
5. `constraints.items[]` を、機械検査で判定できるものと、人間の目視審査を要するものに分類します
6. 正規化結果を台本台帳（`data/transcript.json`）と素材台帳（`data/clips.json`）の初期状態として書き出します

台帳の構造は `assets/transcript.schema.json` と `assets/clips.schema.json` が正です。
