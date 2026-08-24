const validator = require('../src/skills/spec-to-video/scripts/ledger_validate.js');

/** @returns {Record<string, any>} */
function baseTranscript() {
  return {
    version: '1',
    scenes: [
      {
        scene_id: 'S1',
        subtitle_lines: [{ text: 'ここから始まります', char_count: 9 }],
        narration_text: '導入を読みます',
        figure_text: [],
        measured_narration_sec: 6,
        direction: {
          motion_easing: 'ease',
          blend_mode: 'normal',
          telop_pattern: 'multi_outline',
        },
      },
    ],
  };
}

/** @returns {Record<string, any>} */
function baseClips() {
  return {
    version: '1',
    materials: [
      { material_id: 'M1', scene_id: 'S1', order: 0, kind: 'clip', adopted: true, generation_count: 1 },
    ],
  };
}

const SCENES_SPEC = [{ scene_id: 'S1', duration_sec: 8, material_count: 1 }];

describe('必須項目の検査', () => {
  test('充足している場合は検出がありません', () => {
    expect(validator.validateRequired(baseTranscript(), baseClips())).toEqual([]);
  });

  test('台本の必須項目が欠けている場合に検出します', () => {
    const transcript = baseTranscript();
    delete transcript.scenes[0].narration_text;
    expect(validator.validateRequired(transcript, baseClips())).toHaveLength(1);
  });

  test('素材台帳の必須項目が欠けている場合に検出します', () => {
    const clips = baseClips();
    delete clips.materials[0].adopted;
    expect(validator.validateRequired(baseTranscript(), clips)).toHaveLength(1);
  });
});

describe('字幕の可読検査', () => {
  const rules = validator.loadRules();

  test('規約内の字幕は検出しません', () => {
    expect(validator.validateSubtitles(baseTranscript(), rules)).toEqual([]);
  });

  test('1行の文字数上限を超えると検出します', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].subtitle_lines = [{ text: 'あ'.repeat(30), char_count: 30 }];
    expect(validator.validateSubtitles(transcript, rules)[0].code).toBe('subtitle.chars');
  });

  test('行数上限を超えると検出します', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].subtitle_lines = [
      { text: 'あ', char_count: 1 },
      { text: 'い', char_count: 1 },
      { text: 'う', char_count: 1 },
    ];
    expect(validator.validateSubtitles(transcript, rules).some((f) => f.code === 'subtitle.lines')).toBe(true);
  });

  test('表示時間が下限を下回ると検出します', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].measured_narration_sec = 0.5;
    expect(validator.validateSubtitles(transcript, rules).some((f) => f.code === 'subtitle.display')).toBe(true);
  });
});

describe('尺整合の検査', () => {
  test('実尺がシーン尺に収まる場合は検出しません', () => {
    expect(validator.validateDuration(baseTranscript(), SCENES_SPEC)).toEqual([]);
  });

  test('実尺がシーン尺を超えると検出します', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].measured_narration_sec = 9;
    expect(validator.validateDuration(transcript, SCENES_SPEC)[0].code).toBe('duration.over');
  });

  test('実尺が下回る場合は検出しません', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].measured_narration_sec = 2;
    expect(validator.validateDuration(transcript, SCENES_SPEC)).toEqual([]);
  });
});

describe('カット数の一致', () => {
  test('指定と一致する場合は検出しません', () => {
    expect(validator.validateCutCount(baseClips(), SCENES_SPEC)).toEqual([]);
  });

  test('起点画像はカット数に数えません', () => {
    const clips = baseClips();
    clips.materials.push({ material_id: 'M0', scene_id: 'S1', order: 1, kind: 'still_seed', adopted: true, generation_count: 1 });
    expect(validator.validateCutCount(clips, SCENES_SPEC)).toEqual([]);
  });

  test('指定と異なる場合に検出します', () => {
    const clips = baseClips();
    clips.materials.push({ material_id: 'M2', scene_id: 'S1', order: 1, kind: 'clip', adopted: true, generation_count: 1 });
    expect(validator.validateCutCount(clips, SCENES_SPEC)[0].code).toBe('cut.count');
  });
});

describe('文言の検査', () => {
  const rules = validator.loadRules();

  test('図解文言があるのに未校正の場合に検出します', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].figure_text = ['三つの手順'];
    expect(validator.validateWording(transcript, rules).some((f) => f.code === 'wording.proofread')).toBe(true);
  });

  test('校正済みなら検出しません', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].figure_text = ['三つの手順'];
    transcript.scenes[0].proofread_at = '2026-08-24T00:00:00+09:00';
    expect(validator.validateWording(transcript, rules).some((f) => f.code === 'wording.proofread')).toBe(false);
  });

  test('平易でない語を検出します', () => {
    const transcript = baseTranscript();
    transcript.scenes[0].narration_text = 'このソリューションを導入します';
    expect(validator.validateWording(transcript, rules).some((f) => f.code === 'wording.term')).toBe(true);
  });
});

describe('一括実行', () => {
  test('必須項目に不足がある場合は機械検査へ進みません', () => {
    const transcript = baseTranscript();
    delete transcript.scenes[0].subtitle_lines;
    const findings = validator.validateAll({ transcript, clips: baseClips(), scenesSpec: SCENES_SPEC });
    expect(findings.every((f) => f.code.startsWith('transcript.'))).toBe(true);
  });

  test('すべて充足していれば検出がありません', () => {
    expect(validator.validateAll({ transcript: baseTranscript(), clips: baseClips(), scenesSpec: SCENES_SPEC })).toEqual([]);
  });
});

describe('入口ゲートの取りこぼし防止', () => {
  test('設計書のシーン情報が渡されない場合は停止します', () => {
    expect(() =>
      validator.validateAll({ transcript: baseTranscript(), clips: baseClips() }),
    ).toThrow();
  });

  test('設計書側に対応の無いシーンを検出します', () => {
    const findings = validator.validateDuration(baseTranscript(), [
      { scene_id: 'S99', duration_sec: 8, material_count: 1 },
    ]);
    expect(findings.some((f) => f.code === 'duration.scene_not_in_spec')).toBe(true);
  });
});

describe('文脈自立の検査', () => {
  const rules = validator.loadRules();

  test.each(['これは重要です', 'その手順を行います', 'また設定します'])(
    '%s は単体で状況を示していないものとして検出します',
    (text) => {
      const transcript = baseTranscript();
      transcript.scenes[0].subtitle_lines = [{ text, char_count: text.length }];
      expect(validator.validateContextFree(transcript, rules).some((f) => f.code === 'subtitle.context')).toBe(true);
    },
  );

  test('状況を示す字幕は検出しません', () => {
    expect(validator.validateContextFree(baseTranscript(), rules)).toEqual([]);
  });
});

describe('表示時間の判定基準', () => {
  test('ledger_validate と build_subtitles の判定が一致します', () => {
    const { assertReadable } = require('../src/skills/spec-to-video/scripts/build_subtitles.js');
    const rules = validator.loadRules();
    const transcript = baseTranscript();
    transcript.scenes[0].subtitle_lines = [
      { text: 'ここから', char_count: 4 },
      { text: '始まります', char_count: 5 },
    ];
    transcript.scenes[0].measured_narration_sec = 2.0;
    const ledgerFindings = validator.validateSubtitles(transcript, rules);
    let subtitleThrew = false;
    try {
      assertReadable(transcript.scenes[0], rules, 2.0);
    } catch (error) {
      subtitleThrew = true;
    }
    expect(ledgerFindings.some((f) => f.code === 'subtitle.display')).toBe(subtitleThrew);
  });
});

describe('トランジションの選定', () => {
  const rules = validator.loadRules();

  /** @returns {any} */
  function transcriptWithCuts(/** @type {any} */ transitions = undefined) {
    const t = baseTranscript();
    t.scenes[0].cuts = [{ cut_id: 'C1', narration_text: 'あ' }, { cut_id: 'C2', narration_text: 'い' }];
    if (transitions !== undefined) t.scenes[0].transitions = transitions;
    return t;
  }

  test('選定が無いカットを検出します', () => {
    const findings = validator.validateTransitions(transcriptWithCuts(), rules);
    expect(findings.filter((f) => f.code === 'transition.missing')).toHaveLength(2);
  });

  test('選定済みなら検出しません', () => {
    const transitions = [
      { at_cut_id: 'C1', kind: 'cut', duration_sec: 0, reason: '冒頭のため遷移を置きません' },
      { at_cut_id: 'C2', kind: 'cross_dissolve', duration_sec: 0.4, reason: '同一シーン内のカット送りです' },
    ];
    expect(validator.validateTransitions(transcriptWithCuts(transitions), rules)).toEqual([]);
  });

  test('対応表に無い種類を検出します', () => {
    const transitions = [
      { at_cut_id: 'C1', kind: 'cut', duration_sec: 0, reason: '冒頭です' },
      { at_cut_id: 'C2', kind: 'iris_round', duration_sec: 0.4, reason: '演出です' },
    ];
    expect(validator.validateTransitions(transcriptWithCuts(transitions), rules).some((f) => f.code === 'transition.kind')).toBe(true);
  });

  test('選定理由が無い場合を検出します', () => {
    const transitions = [
      { at_cut_id: 'C1', kind: 'cut', duration_sec: 0, reason: '冒頭です' },
      { at_cut_id: 'C2', kind: 'cross_dissolve', duration_sec: 0.4, reason: '' },
    ];
    expect(validator.validateTransitions(transcriptWithCuts(transitions), rules).some((f) => f.code === 'transition.reason')).toBe(true);
  });

  test('輝度が急激に変わる遷移の連続を検出します', () => {
    const transitions = [
      { at_cut_id: 'C1', kind: 'dip_to_black', duration_sec: 0.6, reason: '章の区切りです' },
      { at_cut_id: 'C2', kind: 'dip_to_white', duration_sec: 0.6, reason: '回想へ移ります' },
    ];
    expect(validator.validateTransitions(transcriptWithCuts(transitions), rules).some((f) => f.code === 'transition.consecutive_luminance')).toBe(true);
  });

  test('種類が上限を超える場合を検出します', () => {
    const t = baseTranscript();
    t.scenes[0].cuts = [{ cut_id: 'C1' }, { cut_id: 'C2' }, { cut_id: 'C3' }, { cut_id: 'C4' }];
    t.scenes[0].transitions = [
      { at_cut_id: 'C1', kind: 'cut', duration_sec: 0, reason: 'r' },
      { at_cut_id: 'C2', kind: 'cross_dissolve', duration_sec: 0.4, reason: 'r' },
      { at_cut_id: 'C3', kind: 'dip_to_black', duration_sec: 0.6, reason: 'r' },
      { at_cut_id: 'C4', kind: 'dip_to_white', duration_sec: 0.6, reason: 'r' },
    ];
    expect(validator.validateTransitions(t, rules).some((f) => f.code === 'transition.kinds_count')).toBe(true);
  });
});

describe('演出の選定', () => {
  const rules = validator.loadRules();

  /** @returns {any} */
  function withDirection(/** @type {any} */ direction = undefined) {
    const t = baseTranscript();
    if (direction === undefined) {
      delete t.scenes[0].direction;
      return t;
    }
    t.scenes[0].direction = direction;
    return t;
  }

  test('演出が未選定のシーンを検出します', () => {
    expect(validator.validateDirection(withDirection(), rules)[0].code).toBe('direction.missing');
  });

  test('既定の選定なら検出しません', () => {
    const direction = {
      motion_easing: 'ease',
      blend_mode: 'normal',
      telop_pattern: 'multi_outline',
      color_note: '設計書の配色指定に従いました',
    };
    expect(validator.validateDirection(withDirection(direction), rules)).toEqual([]);
  });

  test('対応表に無い値を検出します', () => {
    const direction = {
      motion_easing: 'bounce',
      blend_mode: 'normal',
      telop_pattern: 'multi_outline',
    };
    expect(validator.validateDirection(withDirection(direction), rules).some((f) => f.code === 'direction.value')).toBe(true);
  });

  test('輝度が上がる描画モードは理由が必要です', () => {
    const direction = {
      motion_easing: 'ease',
      blend_mode: 'screen',
      telop_pattern: 'multi_outline',
    };
    expect(validator.validateDirection(withDirection(direction), rules).some((f) => f.code === 'direction.blend_reason')).toBe(true);
  });

  test('理由があれば通ります', () => {
    const direction = {
      motion_easing: 'ease',
      blend_mode: 'screen',
      telop_pattern: 'multi_outline',
      blend_reason: '設計書が光の演出を指定しているためです',
    };
    expect(validator.validateDirection(withDirection(direction), rules)).toEqual([]);
  });

  test('エフェクトには使う目的が必要です', () => {
    const direction = {
      motion_easing: 'ease',
      blend_mode: 'normal',
      telop_pattern: 'multi_outline',
      effects: [{ name: 'blur', purpose: '' }],
    };
    expect(validator.validateDirection(withDirection(direction), rules).some((f) => f.code === 'direction.effect_purpose')).toBe(true);
  });
});

describe('絵コンテと設計書の突き合わせ', () => {
  /** @returns {any} */
  function boardTranscript(/** @type {any[]} */ cuts) {
    const t = baseTranscript();
    t.scenes[0].cuts = cuts;
    return t;
  }

  const SPEC_WITH_CUTS = [
    {
      scene_id: 'S1',
      duration_sec: 8,
      material_count: 2,
      cuts: [
        { cut_id: 'C01', material_kind: 'clip', duration_sec: 4 },
        { cut_id: 'C02', material_kind: 'figure', duration_sec: 4 },
      ],
    },
  ];

  test('一致していれば検出しません', () => {
    const cuts = [
      { cut_id: 'C01', material_kind: 'clip', duration_sec: 4, narration_text: 'あ' },
      { cut_id: 'C02', material_kind: 'figure', duration_sec: 4, narration_text: 'い' },
    ];
    expect(validator.validateStoryboard(boardTranscript(cuts), SPEC_WITH_CUTS)).toEqual([]);
  });

  test('カット数の食い違いを検出します', () => {
    const cuts = [{ cut_id: 'C01', material_kind: 'clip', duration_sec: 4 }];
    const findings = validator.validateStoryboard(boardTranscript(cuts), SPEC_WITH_CUTS);
    expect(findings[0].code).toBe('storyboard.cut_count');
  });

  test('カット識別子の食い違いを検出します', () => {
    const cuts = [
      { cut_id: 'C01', material_kind: 'clip', duration_sec: 4 },
      { cut_id: 'C99', material_kind: 'figure', duration_sec: 4 },
    ];
    expect(validator.validateStoryboard(boardTranscript(cuts), SPEC_WITH_CUTS).some((f) => f.code === 'storyboard.cut_id')).toBe(true);
  });

  test('尺の食い違いを検出します', () => {
    const cuts = [
      { cut_id: 'C01', material_kind: 'clip', duration_sec: 6 },
      { cut_id: 'C02', material_kind: 'figure', duration_sec: 4 },
    ];
    const findings = validator.validateStoryboard(boardTranscript(cuts), SPEC_WITH_CUTS);
    expect(findings.some((f) => f.code === 'storyboard.cut_duration')).toBe(true);
    expect(findings[0].message).toContain('C01');
  });

  test('素材種別の食い違いを検出します', () => {
    const cuts = [
      { cut_id: 'C01', material_kind: 'clip', duration_sec: 4 },
      { cut_id: 'C02', material_kind: 'clip', duration_sec: 4 },
    ];
    expect(validator.validateStoryboard(boardTranscript(cuts), SPEC_WITH_CUTS).some((f) => f.code === 'storyboard.cut_kind')).toBe(true);
  });

  test('設計書側にカットが無い場合は突き合わせません', () => {
    const cuts = [{ cut_id: 'C01', material_kind: 'clip', duration_sec: 4 }];
    expect(validator.validateStoryboard(boardTranscript(cuts), [{ scene_id: 'S1', duration_sec: 8 }])).toEqual([]);
  });
});
