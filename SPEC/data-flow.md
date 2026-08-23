# データフロー

```mermaid
flowchart LR
    DOC[動画設計書] --> P1[parse_design_doc]
    P1 --> T[(台本台帳)]
    P1 --> C[(素材台帳)]
    T --> P4[synthesize_narration]
    P4 --> T
    T --> P6[build_subtitles]
    P6 --> SRT[out/subtitles.srt]
    T --> V[ledger_validate]
    C --> V
    C --> P8[generate_asset]
    P8 --> C
    P8 --> COST[(out/cost_log.json)]
    C --> P12[render_video]
    SRT --> P12
    P12 --> MP4[out/final.mp4]
    P12 --> COST
    MP4 --> P13[analyze_frames]
    P13 --> FA[out/frame_analysis.json]
    FA --> REP[out/report.md]
    COST --> REP
```

外部との境界は次の3か所です。いずれも利用者の環境で動きます。

| 境界 | 相手 | 資格情報 |
|---|---|---|
| generate_asset | 生成 API | 必要です（環境変数から読みます） |
| synthesize_narration | ローカル TTS | 不要です |
| render_video | Remotion | 不要です |
