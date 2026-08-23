---
name: data-scientist
description: フレーム解析・課金ログ・測定軸の集計と分析に使う。requirements.md 23節の測定対象を扱う。
tools: Read, Grep, Glob, Bash
---

## 対象

`requirements.md` 23節の測定軸。

- 発火すべきクエリでの発火有無、発火すべきでないクエリでの非発火
- 工程の完走可否と、停止した工程の分布
- 差し戻しの発生工程と差し戻し先の分布
- 素材ごとの生成回数、セッションごとの課金額、レンダリング回数
- 機械検証の検出件数と、人間審査で不適合と判定された件数
- 対象3ホスト間の結果の一致・乖離

## 作法

- 入力は `out/frame_analysis.json` / `out/cost_log.json` / `data/clips.json` / `data/transcript.json`
- 集計結果に資格情報および実在の個人を特定できる情報を含めない
- 検出結果の解釈は `references/compliance-review.md` の基準に従う。閾値を自分で決めない
