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
  test('承認が無い場合は生成を開始しません', async () => {
    await expect(
      generateAssets({ materials: materials(), costLog: [], costPolicy: POLICY, unitPrice: 10, approved: false, environment: DEV }),
    ).rejects.toThrow();
  });

  test('承認があれば生成し、課金ログへ記録します', async () => {
    const result = await generateAssets({ materials: materials(), costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: DEV });
    expect(result.costLog).toHaveLength(2);
    expect(result.materials[0].generation_count).toBe(1);
  });

  test('採用済みの素材は再生成しません', async () => {
    const input = materials();
    input[0].adopted = true;
    const result = await generateAssets({ materials: input, costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: DEV });
    expect(result.materials[0].generation_count).toBe(0);
    expect(result.costLog).toHaveLength(1);
  });

  test('リトライ上限に達した素材は保留し、他を続行します', async () => {
    const input = materials();
    input[0].generation_count = 2;
    const result = await generateAssets({ materials: input, costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: DEV });
    expect(result.held).toEqual(['M1']);
    expect(result.materials[1].generation_count).toBe(1);
    expect(result.stopped_by).toBe('retry_limit');
  });

  test('ハードキャップに達したら全生成を停止します', async () => {
    const result = await generateAssets({ materials: materials(), costLog: [], costPolicy: { retry_limit: 5, hard_cap: 10 }, unitPrice: 10, approved: true, environment: DEV });
    expect(result.stopped_by).toBe('hard_cap');
    expect(result.materials[1].generation_count).toBe(0);
  });

  test('本番環境で実行手段が無い場合は停止します', async () => {
    await expect(
      generateAssets({ materials: materials(), costLog: [], costPolicy: POLICY, unitPrice: 10, approved: true, environment: { SPEC_TO_VIDEO_ENV: 'production' } }),
    ).rejects.toThrow();
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

  test('採用済み素材のみでレンダリングし、レンダ回数を増やします', async () => {
    const result = await renderVideo({
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

  test('採用済み素材が無い場合は停止します', async () => {
    await expect(
      renderVideo({ outputSpec: spec, materials: [{ material_id: 'M1', adopted: false }], costLog: [], renderCount: 0, outputPath: 'out/final.mp4', renderer }),
    ).rejects.toThrow();
  });

  test('採用済みなのにファイルが無い場合は停止します', async () => {
    await expect(
      renderVideo({ outputSpec: spec, materials: [{ material_id: 'M1', adopted: true }], costLog: [], renderCount: 0, outputPath: 'out/final.mp4', renderer }),
    ).rejects.toThrow(/M1/);
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

describe('ハードキャップの事前停止', () => {
  test('上限を超える生成は実行しません', async () => {
    const result = await generateAssets({
      materials: materials(),
      costLog: [],
      costPolicy: { retry_limit: 5, hard_cap: 15 },
      unitPrice: 10,
      approved: true,
      environment: { SPEC_TO_VIDEO_ENV: 'development' },
    });
    expect(totalCost(result.costLog)).toBeLessThanOrEqual(15);
    expect(result.stopped_by).toBe('hard_cap');
  });

  test('上限に収まる範囲では生成します', async () => {
    const result = await generateAssets({
      materials: materials(),
      costLog: [],
      costPolicy: { retry_limit: 5, hard_cap: 20 },
      unitPrice: 10,
      approved: true,
      environment: { SPEC_TO_VIDEO_ENV: 'development' },
    });
    expect(result.costLog).toHaveLength(2);
  });
});

describe('対象ごとの課金上限', () => {
  const { costByKind, resolveKindCap, resolveUnitPrice } = require('../src/skills/spec-to-video/scripts/generate_asset.js');
  const DEV_ENV = { SPEC_TO_VIDEO_ENV: 'development' };

  /** クリップ2本と図解2枚です。 */
  /** @returns {any[]} */
  function mixed() {
    return [
      { material_id: 'M1', scene_id: 'S1', order: 0, kind: 'clip', adopted: false, generation_count: 0, prompt: 'p', model_name: 'veo' },
      { material_id: 'M2', scene_id: 'S1', order: 1, kind: 'clip', adopted: false, generation_count: 0, prompt: 'p', model_name: 'veo' },
      { material_id: 'M3', scene_id: 'S2', order: 0, kind: 'figure', adopted: false, generation_count: 0, prompt: 'p', model_name: 'nano banana' },
      { material_id: 'M4', scene_id: 'S2', order: 1, kind: 'figure', adopted: false, generation_count: 0, prompt: 'p', model_name: 'nano banana' },
    ];
  }

  const UNIT_PRICE = { clip: 0.4, figure: 0.067 };

  test('上限を設けない対象は Infinity として扱います', () => {
    expect(resolveKindCap({ hard_cap_by_kind: { clip: 10, figure: null } }, 'figure')).toBe(Infinity);
    expect(resolveKindCap({ hard_cap_by_kind: { clip: 10, figure: null } }, 'clip')).toBe(10);
    expect(resolveKindCap({}, 'clip')).toBe(Infinity);
  });

  test('対象ごとの単価を取り出します', () => {
    expect(resolveUnitPrice(UNIT_PRICE, 'clip')).toBe(0.4);
    expect(resolveUnitPrice(0.5, 'figure')).toBe(0.5);
    expect(() => resolveUnitPrice(UNIT_PRICE, 'still_seed')).toThrow();
  });

  test('クリップだけ上限に達した場合、図解の生成は続きます', async () => {
    const result = await generateAssets({
      materials: mixed(),
      costLog: [],
      costPolicy: { retry_limit: 3, hard_cap_by_kind: { clip: 0.5, figure: null } },
      unitPrice: UNIT_PRICE,
      approved: true,
      environment: DEV_ENV,
    });
    expect(costByKind(result.costLog, 'clip')).toBeCloseTo(0.4, 4);
    expect(result.costLog.filter((e) => e.operation === 'figure')).toHaveLength(2);
    expect(result.stopped_kinds).toEqual(['clip']);
    expect(result.stopped_by).toBe('hard_cap_by_kind');
  });

  test('上限を設けない対象は数量に関わらず生成します', async () => {
    const result = await generateAssets({
      materials: mixed(),
      costLog: [],
      costPolicy: { retry_limit: 3, hard_cap_by_kind: { clip: 10, figure: null } },
      unitPrice: UNIT_PRICE,
      approved: true,
      environment: DEV_ENV,
    });
    expect(result.costLog).toHaveLength(4);
    expect(result.stopped_by).toBeNull();
  });

  test('全体上限が先に到達した場合はすべて停止します', async () => {
    const result = await generateAssets({
      materials: mixed(),
      costLog: [],
      costPolicy: { retry_limit: 3, hard_cap: 0.5, hard_cap_by_kind: { clip: 10, figure: null } },
      unitPrice: UNIT_PRICE,
      approved: true,
      environment: DEV_ENV,
    });
    expect(result.stopped_by).toBe('hard_cap');
    expect(result.costLog).toHaveLength(1);
  });
});

describe('非同期のレンダラー', () => {
  const spec = { resolution: "1920x1080", fps: "30fps", codec: "H.264", audio: "AAC" };
  const materials = [{ material_id: "M1", adopted: true, file_path: "a.mp4" }];

  test('Promise を返すレンダラーの完了を待ちます', async () => {
    const renderer = {
      render: (/** @type {any} */ input) =>
        new Promise((resolve) => setTimeout(() => resolve({ file_path: input.outputPath }), 10)),
    };
    const result = await renderVideo({
      outputSpec: spec,
      materials,
      costLog: [],
      renderCount: 0,
      outputPath: "out/final.mp4",
      renderer,
    });
    expect(result.file_path).toBe("out/final.mp4");
    expect(result.render_count).toBe(1);
  });

  test('同期のレンダラーも従来どおり動作します', async () => {
    const renderer = { render: (/** @type {any} */ input) => ({ file_path: input.outputPath }) };
    const result = await renderVideo({
      outputSpec: spec,
      materials,
      costLog: [],
      renderCount: 2,
      outputPath: "out/final.mp4",
      renderer,
    });
    expect(result.render_count).toBe(3);
  });

  test('レンダラーが失敗した場合はレンダ回数を加算せず停止します', async () => {
    const renderer = /** @type {any} */ ({ render: () => Promise.reject(new Error("書き込みに失敗しました")) });
    await expect(
      renderVideo({
        outputSpec: spec,
        materials,
        costLog: [],
        renderCount: 0,
        outputPath: "out/final.mp4",
        renderer,
      }),
    ).rejects.toThrow();
  });

  test('ファイルパスを返さないレンダラーは停止します', async () => {
    const renderer = /** @type {any} */ ({ render: () => Promise.resolve({}) });
    await expect(
      renderVideo({
        outputSpec: spec,
        materials,
        costLog: [],
        renderCount: 0,
        outputPath: "out/final.mp4",
        renderer,
      }),
    ).rejects.toThrow();
  });
});

describe('非同期の生成器', () => {
  const POLICY_ASYNC = { retry_limit: 2, hard_cap: 100 };

  /** @returns {any[]} */
  function one() {
    return [
      { material_id: 'M1', scene_id: 'S1', order: 0, kind: 'clip', adopted: false, generation_count: 0, prompt: 'p', model_name: 'veo' },
      { material_id: 'M2', scene_id: 'S1', order: 1, kind: 'clip', adopted: false, generation_count: 0, prompt: 'p', model_name: 'veo' },
    ];
  }

  const PROD = { SPEC_TO_VIDEO_ENV: 'production' };

  test('Promise を返す生成器の完了を待ちます', async () => {
    const generator = {
      generate: (/** @type {any} */ request) =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ file_path: `out/${request.materialId}.mp4`, duration_sec: 8 }), 5);
        }),
    };
    const result = await generateAssets({
      materials: one(), costLog: [], costPolicy: POLICY_ASYNC, unitPrice: 1,
      approved: true, generator, environment: PROD,
    });
    expect(result.materials[0].file_path).toBe('out/M1.mp4');
    expect(result.materials[1].file_path).toBe('out/M2.mp4');
    expect(result.materials[0].duration_sec).toBe(8);
  });

  test('生成器へ素材識別子を渡します', async () => {
    /** @type {any[]} */
    const seen = [];
    const generator = {
      generate: async (/** @type {any} */ request) => {
        seen.push(request);
        return { file_path: 'out/x.mp4', duration_sec: 0 };
      },
    };
    await generateAssets({
      materials: one(), costLog: [], costPolicy: POLICY_ASYNC, unitPrice: 1,
      approved: true, generator, environment: PROD,
    });
    expect(seen.map((r) => r.materialId)).toEqual(['M1', 'M2']);
  });

  test('同期の生成器も従来どおり動作します', async () => {
    const generator = {
      generate: (/** @type {any} */ request) => ({ file_path: `out/${request.materialId}.png`, duration_sec: 0 }),
    };
    const result = await generateAssets({
      materials: one(), costLog: [], costPolicy: POLICY_ASYNC, unitPrice: 1,
      approved: true, generator, environment: PROD,
    });
    expect(result.materials[0].file_path).toBe('out/M1.png');
    expect(result.costLog).toHaveLength(2);
  });

  test('ファイルパスを返さない生成器は停止します', async () => {
    const generator = { generate: async () => ({ duration_sec: 0 }) };
    await expect(
      generateAssets({
        materials: one(), costLog: [], costPolicy: POLICY_ASYNC, unitPrice: 1,
        approved: true, generator: /** @type {any} */ (generator), environment: PROD,
      }),
    ).rejects.toThrow();
  });

  test('生成に失敗した素材は保留し、他の素材は続けます', async () => {
    const generator = {
      generate: async (/** @type {any} */ request) => {
        if (request.materialId === 'M1') throw new Error('接続できません');
        return { file_path: 'out/M2.mp4', duration_sec: 8 };
      },
    };
    const result = await generateAssets({
      materials: one(), costLog: [], costPolicy: POLICY_ASYNC, unitPrice: 1,
      approved: true, generator, environment: PROD,
    });
    expect(result.materials[0].file_path).toBeUndefined();
    expect(result.materials[0].generation_count).toBe(1);
    expect(result.materials[1].file_path).toBe('out/M2.mp4');
    expect(result.costLog).toHaveLength(1);
    expect(result.stopped_by).toBe('generation_failed');
    expect(result.failed.map((/** @type {any} */ f) => f.material_id)).toEqual(['M1']);
  });

  test('失敗した素材に課金を計上しません', async () => {
    const generator = { generate: async () => { throw new Error('失敗'); } };
    const result = await generateAssets({
      materials: one(), costLog: [], costPolicy: POLICY_ASYNC, unitPrice: 1,
      approved: true, generator, environment: PROD,
    });
    expect(result.costLog).toHaveLength(0);
    expect(totalCost(result.costLog)).toBe(0);
  });
});
