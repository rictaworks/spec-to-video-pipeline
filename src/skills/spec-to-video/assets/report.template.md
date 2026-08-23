# 実行レポート

対象設計書: {design_doc_path}
実行日時: {executed_at}（JST）

このレポートに資格情報およびその一部を記載しません。

## 1. 対象設計書と実行スコープ

| 項目 | 内容 |
|---|---|
| 設計書 | {design_doc_path} |
| 制作モード | {production_mode} |
| 実行スコープ | {scope} |
| 実行環境 | {environment} |

## 2. 生成素材の一覧

| 素材ID | シーン | 種別 | モデル | 生成回数 | 採否 |
|---|---|---|---|---|---|
| {material_id} | {scene_id} | {kind} | {model_name} | {generation_count} | {adopted} |

## 3. ナレーション実尺とシーン尺の対照

| シーン | シーン尺 | ナレーション実尺 | 差分 |
|---|---|---|---|
| {scene_id} | {duration_sec} | {measured_narration_sec} | {diff_sec} |

## 4. 字幕の可読検査の結果

| 項目 | 判定 | 該当箇所 |
|---|---|---|
| 1行あたりの文字数 | {result} | {location} |
| 行数 | {result} | {location} |
| 表示時間 | {result} | {location} |
| 文脈自立 | {result} | {location} |

## 5. 機械検証の検出一覧と該当区間

| 項目 | 検出件数 | 該当区間 |
|---|---|---|
| 光感受性 | {count} | {ranges} |
| 規則的パターン | {count} | {ranges} |
| 不連続フレーム | {count} | {ranges} |
| 出力規格 | {count} | {ranges} |

意図的な輝度・色変化として除外した区間: {excluded_ranges}

## 6. 人間審査を要する項目

- 機械検出されたフレームの最終判断: {status}
- 表現内容の審査: {status}
- 意図しない文字・ロゴ・実在人物の映り込みの確認: {status}
- 素材間の質感連続性の確認: {status}

## 7. 課金の記録

| 項目 | 値 |
|---|---|
| 生成回数の合計 | {total_generations} |
| レンダリング回数 | {render_count} |
| 見積もり課金額 | {estimated_cost} |
| 停止理由 | {stopped_by} |

## 8. 未完了の工程と差し戻し先

| 工程 | 状態 | 差し戻し先 | 理由 |
|---|---|---|---|
| {phase} | {status} | {routed_to} | {reason} |
