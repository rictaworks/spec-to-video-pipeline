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
