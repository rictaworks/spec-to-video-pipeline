const {
  normalizeDesignDoc,
  toSeconds,
  resolveFps,
} = require('../src/skills/spec-to-video/scripts/parse_design_doc.js');

/** @returns {any} */
function baseExtracted() {
  return {
    meta: {
      repository: 'sample-repo',
      edition: 'full',
      production_mode: 'generative',
      models: 'veo, nano banana',
    },
    output_spec: { resolution: '1920x1080', fps: '30', codec: 'H.264', audio: 'AAC' },
    cost_policy: { retry_limit: 3, hard_cap: 5000 },
    narration: { engine: 'local-tts', speaker: '四国めたん' },
    scenes: [
      {
        scene_id: 'S1',
        duration_sec: 8,
        material_count: 2,
        cuts: [
          { cut_id: 'C1', material_kind: 'clip', duration_sec: 4 },
          { cut_id: 'C2', material_kind: 'clip', duration_sec: 4 },
        ],
        visual: '街の遠景',
        subtitles: ['ここから始まります'],
        narration_policy: '導入を読みます',
        intentional_luminance_change: false,
      },
    ],
  };
}

describe('尺の単位換算', () => {
  test.each([
    ['8', 8, 'second'],
    ['8秒', 8, 'second'],
    ['約5', 5, 'second'],
    ['0:08', 8, 'timecode'],
    ['2:42', 162, 'timecode'],
    ['240F', 8, 'frame'],
    ['4,860フレーム', 162, 'frame'],
  ])('%s を %s 秒として読み取ります', (raw, seconds, unit) => {
    const converted = toSeconds(raw, 30);
    expect(converted).not.toBeNull();
    expect(converted === null ? -1 : converted.seconds).toBeCloseTo(seconds, 3);
    expect(converted === null ? '' : converted.unit).toBe(unit);
  });

  test.each(['未定', '5-8', ''])('%s は読み取らず null を返します', (raw) => {
    expect(toSeconds(raw, 30)).toBeNull();
  });

  test('フレームレートが読み取れない場合、フレーム表記は換算しません', () => {
    expect(toSeconds('240F', Number.NaN)).toBeNull();
  });

  test.each([
    ['30', 30],
    ['30fps', 30],
    ['29.97fps', 29.97],
  ])('フレームレート %s を読み取ります', (raw, expected) => {
    expect(resolveFps({ fps: raw })).toBeCloseTo(expected, 2);
  });
});

describe('正規化の検査', () => {
  test('必要な項目が揃っていれば正規化します', () => {
    const result = normalizeDesignDoc(baseExtracted());
    expect(result.scenes[0].duration_sec).toBe(8);
    expect(result.fps_used_for_conversion).toBe(30);
  });

  test('欠損はどのシーンのどの項目かを列挙して停止します', () => {
    const extracted = baseExtracted();
    delete extracted.scenes[0].visual;
    delete extracted.meta.production_mode;
    expect(() => normalizeDesignDoc(extracted)).toThrow(/meta.production_mode/);
    expect(() => normalizeDesignDoc(extracted)).toThrow(/S1.visual/);
  });

  test('意図的な輝度変化は真偽値でなければ欠損として扱います', () => {
    const extracted = baseExtracted();
    extracted.scenes[0].intentional_luminance_change = 'なし';
    expect(() => normalizeDesignDoc(extracted)).toThrow(/intentional_luminance_change/);
  });

  test('字幕が空の場合も欠損として扱います', () => {
    const extracted = baseExtracted();
    extracted.scenes[0].subtitles = [];
    expect(() => normalizeDesignDoc(extracted)).toThrow(/subtitles/);
  });

  test('対応していない制作モードは停止します', () => {
    const extracted = baseExtracted();
    extracted.meta.production_mode = 'hybrid';
    expect(() => normalizeDesignDoc(extracted)).toThrow(/hybrid/);
  });

  test('対応していない素材種別は停止します', () => {
    const extracted = baseExtracted();
    extracted.scenes[0].cuts[0].material_kind = 'photo';
    expect(() => normalizeDesignDoc(extracted)).toThrow(/photo/);
  });

  test('カット数の指定とカット一覧の件数が食い違う場合は停止します', () => {
    const extracted = baseExtracted();
    extracted.scenes[0].material_count = 3;
    expect(() => normalizeDesignDoc(extracted)).toThrow(/3/);
  });

  test('課金上限が数値でない場合は停止します', () => {
    const extracted = baseExtracted();
    extracted.cost_policy.hard_cap = '未設定';
    expect(() => normalizeDesignDoc(extracted)).toThrow(/hard_cap/);
  });

  test('シーンが無い場合は停止します', () => {
    const extracted = baseExtracted();
    extracted.scenes = [];
    expect(() => normalizeDesignDoc(extracted)).toThrow();
  });
});

describe('実運用の企画書の形式', () => {
  /** フレーム表記・別表のカット数・Remotion 単独モードを含む形式です。 */
  function frameBased() {
    const extracted = baseExtracted();
    extracted.meta.production_mode = 'remotion_only';
    extracted.output_spec.fps = '30fps';
    extracted.scenes = [
      {
        scene_id: 'S1',
        duration_sec: '240F',
        material_count: 1,
        cuts: [{ cut_id: 'C01', material_kind: 'title_card', duration_sec: '240F' }],
        visual: '黒背景にタイトル',
        subtitles: ['第1章'],
        narration_policy: 'タイトル読み上げのみ',
        intentional_luminance_change: false,
      },
      {
        scene_id: 'S8',
        duration_sec: '360F',
        material_count: 3,
        cuts: [
          { cut_id: 'C19', material_kind: 'title_card', duration_sec: '120F' },
          { cut_id: 'C20', material_kind: 'title_card', duration_sec: '120F' },
          { cut_id: 'C21', material_kind: 'title_card', duration_sec: '120F' },
        ],
        visual: '章の一覧とエンドカード',
        subtitles: ['次章で扱います'],
        narration_policy: '次章以降で各手続きを扱う',
        intentional_luminance_change: false,
      },
    ];
    return extracted;
  }

  test('フレーム表記のまま読み取り、秒へ揃えます', () => {
    const result = normalizeDesignDoc(frameBased());
    expect(result.scenes[0].duration_sec).toBe(8);
    expect(result.scenes[1].duration_sec).toBe(12);
    expect(result.scenes[0].duration_source_unit).toBe('frame');
  });

  test('換算に用いたフレームレートを記録します', () => {
    expect(normalizeDesignDoc(frameBased()).fps_used_for_conversion).toBe(30);
  });

  test('フレームレートが読み取れない場合は欠損として停止します', () => {
    const extracted = frameBased();
    extracted.output_spec.fps = '未定';
    expect(() => normalizeDesignDoc(extracted)).toThrow(/duration_sec/);
  });
});

describe('1つのシーンに素材種別が混在する形式', () => {
  /** 実運用の企画書では、図解とクリップが同じシーンに並びます。 */
  /** @returns {any} */
  function mixedScene() {
    return {
      meta: {
        repository: 'climate-site-risk-concept-video',
        edition: 'デモ版',
        production_mode: 'generative',
        models: 'Veo 3.1 Fast / nano banana / VOICEVOX',
      },
      output_spec: { resolution: '1920x1080', fps: '30fps', codec: 'H.264', audio: 'AAC' },
      cost_policy: { retry_limit: 3, hard_cap: 20000 },
      narration: { engine: 'VOICEVOX', speaker: 'No.7' },
      scenes: [
        {
          scene_id: 'S4',
          duration_sec: '420F',
          material_count: 2,
          visual: '図解とクリップ',
          subtitles: ['問い'],
          narration_policy: '問いを提示します',
          intentional_luminance_change: false,
          cuts: [
            { cut_id: 'C09', material_kind: 'figure', duration_sec: '180F' },
            { cut_id: 'C10', material_kind: 'clip', duration_sec: '240F' },
          ],
        },
      ],
    };
  }

  test('図解とクリップの混在を丸めずに保持します', () => {
    const result = normalizeDesignDoc(mixedScene());
    expect(result.scenes[0].cuts.map((/** @type {any} */ cut) => cut.material_kind)).toEqual(['figure', 'clip']);
  });

  test('カットの尺もフレーム表記から秒へ揃えます', () => {
    const result = normalizeDesignDoc(mixedScene());
    expect(result.scenes[0].cuts[0].duration_sec).toBe(6);
    expect(result.scenes[0].cuts[1].duration_sec).toBe(8);
  });

  test('カット一覧が無いシーンは欠損として停止します', () => {
    const extracted = mixedScene();
    delete extracted.scenes[0].cuts;
    expect(() => normalizeDesignDoc(extracted)).toThrow(/cuts/);
  });
});
