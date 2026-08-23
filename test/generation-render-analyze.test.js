const { generateAssets, estimateCost, totalCost } = require('../src/skills/spec-to-video/scripts/generate_asset.js');
const { renderVideo, assertOutputSpec } = require('../src/skills/spec-to-video/scripts/render_video.js');
const analyzer = require('../src/skills/spec-to-video/scripts/analyze_frames.js');

const DEV = { SPEC_TO_VIDEO_ENV: 'development' };
const POLICY = { retry_limit: 2, hard_cap: 100 };

/** @returns {any[]} */
function materials() {
  return [
    { material_id: 'M1', scene_id: 'S1', order: 0, kind: 'clip', adopted: false, generation_count: 0, prompt: 'p', model_name: 'veo' },
    { material_id: 'M2', scene_id: 'S1', order: 1, kind: 'figure', adopted: false, generation_count: 0, prompt: 'p', model_name: 'nano banana' },
  ];
}

describe('生成の窓口', () => {
  test('承認が無い場合は生成を開始しません', () => {
    expect(() =>
      generateAssets({ materials: materials(), costLog: [], costPolicy: POLICY, unitPrice: 10, approved: false, environment: DEV }),
    ).toThrow();
  });

  test('承認があれば生成し、課金ログへ記録します', () => {
    const result = generateAssets({ materials: materials(), costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: DEV });
    expect(result.costLog).toHaveLength(2);
    expect(result.materials[0].generation_count).toBe(1);
  });

  test('採用済みの素材は再生成しません', () => {
    const input = materials();
    input[0].adopted = true;
    const result = generateAssets({ materials: input, costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: DEV });
    expect(result.materials[0].generation_count).toBe(0);
    expect(result.costLog).toHaveLength(1);
  });

  test('リトライ上限に達した素材は保留し、他を続行します', () => {
    const input = materials();
    input[0].generation_count = 2;
    const result = generateAssets({ materials: input, costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: DEV });
    expect(result.held).toEqual(['M1']);
    expect(result.materials[1].generation_count).toBe(1);
    expect(result.stopped_by).toBe('retry_limit');
  });

  test('ハードキャップに達したら全生成を停止します', () => {
    const result = generateAssets({ materials: materials(), costLog: [], costPolicy: { retry_limit: 5, hard_cap: 10 }, unitPrice: 10, approved: true, environment: DEV });
    expect(result.stopped_by).toBe('hard_cap');
    expect(result.materials[1].generation_count).toBe(0);
  });

  test('本番環境で実行手段が無い場合は停止します', () => {
    expect(() =>
      generateAssets({ materials: materials(), costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: { SPEC_TO_VIDEO_ENV: 'production' } }),
    ).toThrow();
  });

  test('見積もりは単価と点数とリテイク係数の積です', () => {
    expect(estimateCost({ unit_price: 12, quantity: 3, retake_factor: 1.5 })).toBe(54);
    expect(totalCost(/** @type {any[]} */ ([{ estimated_cost: 1.5 }, { estimated_cost: 2.25 }]))).toBe(3.75);
  });
});

describe('レンダリング', () => {
  const spec = { resolution: '1920x1080', fps: '30', codec: 'H.264', audio: 'none' };
  const renderer = { render: (/** @type {any} */ input) => ({ file_path: input.outputPath }) };

  test('出力規格が欠けている場合は停止します', () => {
    expect(() => assertOutputSpec({ resolution: '1920x1080' })).toThrow(/fps/);
  });

  test('採用済み素材のみでレンダリングし、レンダ回数を増やします', () => {
    const result = renderVideo({
      outputSpec: spec,
      materials: [
        { material_id: 'M1', adopted: true, file_path: 'a.mp4' },
        { material_id: 'M2', adopted: false },
      ],
      costLog: [],
      renderCount: 2,
      outputPath: 'out/final.mp4',
      renderer,
    });
    expect(result.render_count).toBe(3);
    expect(result.file_path).toBe('out/final.mp4');
  });

  test('採用済み素材が無い場合は停止します', () => {
    expect(() =>
      renderVideo({ outputSpec: spec, materials: [{ material_id: 'M1', adopted: false }], costLog: [], renderCount: 0, outputPath: 'out/final.mp4', renderer }),
    ).toThrow();
  });

  test('採用済みなのにファイルが無い場合は停止します', () => {
    expect(() =>
      renderVideo({ outputSpec: spec, materials: [{ material_id: 'M1', adopted: true }], costLog: [], renderCount: 0, outputPath: 'out/final.mp4', renderer }),
    ).toThrow(/M1/);
  });
});

describe('フレーム解析', () => {
  /**
   * @param {number[]} luminances
   * @returns {any[]}
   */
  function frames(luminances) {
    return luminances.map((luminance, index) => ({
      index,
      time_sec: index * 0.1,
      luminance,
      red_ratio: 0,
      pattern_ratio: 0,
    }));
  }

  const spec = { resolution: '1920x1080', fps: '30', codec: 'H.264', audio: 'none' };

  test('点滅が上限を超えると区間を返します', () => {
    const flashing = frames([0, 1, 0, 1, 0, 1, 0, 1]);
    const result = analyzer.analyzeFrames({ frames: flashing, outputSpec: spec, actualSpec: spec });
    expect(result.photosensitivity.luminance.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  test('穏やかな変化は検出しません', () => {
    const calm = frames([0, 0.01, 0.02, 0.03, 0.04]);
    const result = analyzer.analyzeFrames({ frames: calm, outputSpec: spec, actualSpec: spec });
    expect(result.photosensitivity.luminance).toEqual([]);
    expect(result.passed).toBe(true);
  });

  test('宣言された区間の不連続は除外します', () => {
    const withSpike = frames([0.1, 0.1, 0.9, 0.1, 0.1]);
    const without = analyzer.detectDiscontinuities(withSpike, 0.35, []);
    const with_ = analyzer.detectDiscontinuities(withSpike, 0.35, [{ start_sec: 0.15, end_sec: 0.25 }]);
    expect(without.length).toBe(1);
    expect(with_.length).toBe(0);
  });

  test('宣言があっても点滅の計測は行います', () => {
    const flashing = frames([0, 1, 0, 1, 0, 1, 0, 1]);
    const result = analyzer.analyzeFrames({
      frames: flashing,
      outputSpec: spec,
      actualSpec: spec,
      declaredRanges: [{ start_sec: 0, end_sec: 10 }],
    });
    expect(result.photosensitivity.luminance.length).toBeGreaterThan(0);
  });

  test('出力規格の不一致を検出します', () => {
    const result = analyzer.analyzeFrames({
      frames: frames([0, 0.01]),
      outputSpec: spec,
      actualSpec: { ...spec, fps: '24' },
    });
    expect(result.output_spec_mismatch).toEqual(['fps']);
    expect(result.passed).toBe(false);
  });

  test('フレームが無い場合は停止します', () => {
    expect(() => analyzer.analyzeFrames({ frames: [], outputSpec: spec, actualSpec: spec })).toThrow();
  });
});
