const fs = require('node:fs');
const path = require('node:path');

const assetsDir = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video', 'assets');

/**
 * @param {string} name
 * @returns {any}
 */
function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(assetsDir, name), 'utf8'));
}

describe('台本台帳のスキーマ', () => {
  const schema = readSchema('transcript.schema.json');
  const scene = schema.$defs.scene;

  test('requirements.md 8.2 の項目を定義しています', () => {
    const expected = [
      'scene_id',
      'subtitle_lines',
      'narration_text',
      'figure_text',
      'measured_narration_sec',
      'proofread_at',
    ];
    expect(Object.keys(scene.properties)).toEqual(expect.arrayContaining(expected));
  });

  test('カット単位のナレーションを保持できます', () => {
    expect(scene.properties.cuts.items.properties.measured_narration_sec).toBeDefined();
  });

  test('必須項目と任意項目を区別しています', () => {
    expect(scene.required).toContain('scene_id');
    expect(scene.required).not.toContain('measured_narration_sec');
  });

  test('未知の項目を許容しません', () => {
    expect(scene.additionalProperties).toBe(false);
  });
});

describe('素材台帳のスキーマ', () => {
  const schema = readSchema('clips.schema.json');
  const material = schema.$defs.material;

  test('requirements.md 8.2 の項目を定義しています', () => {
    const expected = [
      'material_id',
      'scene_id',
      'order',
      'kind',
      'source_still_id',
      'prompt',
      'model_name',
      'model_version',
      'generated_at',
      'generation_count',
      'adopted',
      'file_path',
      'duration_sec',
      'checksum',
      'review',
    ];
    expect(Object.keys(material.properties)).toEqual(expect.arrayContaining(expected));
  });

  test('kind の取り得る値を4種類に限定しています', () => {
    expect(material.properties.kind.enum).toEqual([
      'still_seed',
      'clip',
      'figure',
      'title_card',
    ]);
  });

  test('採否と生成回数を必須にしています', () => {
    expect(material.required).toContain('adopted');
    expect(material.required).toContain('generation_count');
  });

  test('未知の項目を許容しません', () => {
    expect(material.additionalProperties).toBe(false);
  });
});

describe('両台帳に共通する形式', () => {
  test.each(['transcript.schema.json', 'clips.schema.json'])('%s は JSON Schema として解釈できます', (name) => {
    const schema = readSchema(name);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('version');
  });
});
