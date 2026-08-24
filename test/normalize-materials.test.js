const {
  normalizeMaterials,
  assertNormalized,
  requiresNormalization,
  buildSpec,
} = require('../src/skills/spec-to-video/scripts/normalize_materials.js');
const { renderVideo } = require('../src/skills/spec-to-video/scripts/render_video.js');

const DEV = { SPEC_TO_VIDEO_ENV: 'development' };
const PROD = { SPEC_TO_VIDEO_ENV: 'production' };
const SPEC = { resolution: '1920x1080', fps: '30fps', codec: 'H.264', audio: 'AAC' };

/** @returns {any[]} */
function materials() {
  return [
    { material_id: 'C01', kind: 'clip', adopted: true, file_path: 'public/clips/C01.mp4' },
    { material_id: 'C02', kind: 'figure', adopted: true, file_path: 'public/figures/C02.png' },
    { material_id: 'C03', kind: 'clip', adopted: false, file_path: 'public/clips/C03.mp4' },
  ];
}

describe('そろえる対象の判定', () => {
  test('動く素材はそろえる対象です', () => {
    expect(requiresNormalization(/** @type {any} */ ({ material_id: 'C01', kind: 'clip' }))).toBe(true);
  });

  test('静止画はそろえる対象ではありません', () => {
    expect(requiresNormalization(/** @type {any} */ ({ material_id: 'C02', kind: 'figure' }))).toBe(false);
    expect(requiresNormalization(/** @type {any} */ ({ material_id: 'C03', kind: 'still_seed' }))).toBe(false);
  });
});

describe('そろえる先の仕様', () => {
  test('フレームレートは出力規格から取ります', () => {
    expect(buildSpec(SPEC).fps).toBe(30);
  });

  test('固定フレームレート・全キーフレーム・無音トラック・先頭の索引を要求します', () => {
    const spec = buildSpec(SPEC);
    expect(spec.constant_frame_rate).toBe(true);
    expect(spec.all_keyframes).toBe(true);
    expect(spec.silent_audio_track).toBe(true);
    expect(spec.index_at_head).toBe(true);
  });

  test('元の素材を残すことを要求します', () => {
    expect(buildSpec(SPEC).keep_source).toBe(true);
  });

  test('出力規格にフレームレートが無い場合は停止します', () => {
    expect(() => buildSpec(/** @type {any} */ ({ resolution: '1920x1080' }))).toThrow();
  });
});

describe('素材をそろえる', () => {
  test('採用した動く素材だけをそろえます', async () => {
    /** @type {any[]} */
    const seen = [];
    const normalizer = {
      normalize: async (/** @type {any} */ request) => {
        seen.push(request);
        return {
          file_path: `normalized/${request.materialId}.mp4`,
          source_file_path: `source/${request.materialId}.mp4`,
        };
      },
    };
    const result = await normalizeMaterials({
      materials: materials(), outputSpec: SPEC, normalizer, environment: PROD,
    });
    expect(seen.map((r) => r.materialId)).toEqual(['C01']);
    expect(result.normalized).toEqual(['C01']);
    expect(result.skipped).toEqual(['C02']);
  });

  test('そろえた素材に元の場所を記録します', async () => {
    const normalizer = {
      normalize: async (/** @type {any} */ request) => ({
        file_path: `normalized/${request.materialId}.mp4`,
        source_file_path: `source/${request.materialId}.mp4`,
      }),
    };
    const result = await normalizeMaterials({
      materials: materials(), outputSpec: SPEC, normalizer, environment: PROD,
    });
    const clip = /** @type {any} */ (result.materials.find((/** @type {any} */ m) => m.material_id === 'C01'));
    expect(clip.file_path).toBe('normalized/C01.mp4');
    expect(clip.source_file_path).toBe('source/C01.mp4');
    expect(clip.normalized).toBe(true);
  });

  test('変換器へフレームレートとそろえる条件を渡します', async () => {
    /** @type {any} */
    let received = null;
    const normalizer = {
      normalize: async (/** @type {any} */ request) => {
        received = request.spec;
        return { file_path: 'a.mp4', source_file_path: 'b.mp4' };
      },
    };
    await normalizeMaterials({ materials: materials(), outputSpec: SPEC, normalizer, environment: PROD });
    expect(received.fps).toBe(30);
    expect(received.all_keyframes).toBe(true);
    expect(received.silent_audio_track).toBe(true);
  });

  test('済んだ素材はやり直しません', async () => {
    let calls = 0;
    const normalizer = {
      normalize: async () => {
        calls += 1;
        return { file_path: 'a.mp4', source_file_path: 'b.mp4' };
      },
    };
    const input = materials();
    input[0].normalized = true;
    const result = await normalizeMaterials({ materials: input, outputSpec: SPEC, normalizer, environment: PROD });
    expect(calls).toBe(0);
    expect(result.normalized).toEqual([]);
  });

  test('ファイルパスが無い素材は停止します', async () => {
    const normalizer = { normalize: async () => ({ file_path: 'a.mp4', source_file_path: 'b.mp4' }) };
    const input = materials();
    delete input[0].file_path;
    await expect(
      normalizeMaterials({ materials: input, outputSpec: SPEC, normalizer, environment: PROD }),
    ).rejects.toThrow(/C01/);
  });

  test('ファイルパスを返さない変換器は停止します', async () => {
    const normalizer = { normalize: async () => ({ source_file_path: 'b.mp4' }) };
    await expect(
      normalizeMaterials({
        materials: materials(), outputSpec: SPEC,
        normalizer: /** @type {any} */ (normalizer), environment: PROD,
      }),
    ).rejects.toThrow(/C01/);
  });

  test('本番環境で変換器が無い場合は停止します', async () => {
    await expect(
      normalizeMaterials({ materials: materials(), outputSpec: SPEC, environment: PROD }),
    ).rejects.toThrow();
  });

  test('開発環境では外部の変換を行いません', async () => {
    const result = await normalizeMaterials({ materials: materials(), outputSpec: SPEC, environment: DEV });
    expect(result.normalized).toEqual(['C01']);
  });
});

describe('そろえていない素材の検出', () => {
  test('そろえていない動く素材があれば停止します', () => {
    expect(() => assertNormalized(materials())).toThrow(/C01/);
  });

  test('そろえ済みなら通ります', () => {
    const input = materials();
    input[0].normalized = true;
    expect(() => assertNormalized(input)).not.toThrow();
  });

  test('レンダリングはそろえていない素材を受け付けません', async () => {
    const renderer = { render: (/** @type {any} */ input) => ({ file_path: input.outputPath }) };
    await expect(
      renderVideo({
        outputSpec: SPEC, materials: materials(), costLog: [],
        renderCount: 0, outputPath: 'out/final.mp4', renderer,
      }),
    ).rejects.toThrow(/C01/);
  });

  test('そろえ済みならレンダリングできます', async () => {
    const renderer = { render: (/** @type {any} */ input) => ({ file_path: input.outputPath }) };
    const input = materials();
    input[0].normalized = true;
    const result = await renderVideo({
      outputSpec: SPEC, materials: input, costLog: [],
      renderCount: 0, outputPath: 'out/final.mp4', renderer,
    });
    expect(result.file_path).toBe('out/final.mp4');
  });
});
