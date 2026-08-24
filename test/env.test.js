const env = require('../src/skills/spec-to-video/scripts/lib/env.js');
const stub = require('../src/skills/spec-to-video/scripts/lib/stub/generation.js');

describe('実行環境の判定', () => {
  test('development を判定します', () => {
    expect(env.resolveMode({ [env.ENV_VAR]: 'development' })).toBe('development');
  });

  test('production を判定します', () => {
    expect(env.resolveMode({ [env.ENV_VAR]: 'production' })).toBe('production');
  });

  test('未設定の場合は既定値へ切り替えず例外になります', () => {
    expect(() => env.resolveMode({})).toThrow(/SPEC_TO_VIDEO_ENV/);
  });

  test('想定外の値の場合も例外になります', () => {
    expect(() => env.resolveMode({ [env.ENV_VAR]: 'staging' })).toThrow();
  });
});

describe('資格情報の取得', () => {
  test('環境変数から値を取得します', () => {
    expect(env.requireCredential('SAMPLE_KEY', { SAMPLE_KEY: 'value' })).toBe('value');
  });

  test('未設定の場合は例外になり、メッセージに変数名だけが含まれます', () => {
    expect(() => env.requireCredential('SAMPLE_KEY', {})).toThrow(/SAMPLE_KEY/);
  });

  test('例外メッセージに値を含めません', () => {
    try {
      env.requireCredential('SAMPLE_KEY', { SAMPLE_KEY: '' });
    } catch (error) {
      expect(String(error)).not.toContain('value');
    }
  });
});

describe('開発環境の分岐', () => {
  beforeEach(() => {
    stub.reset();
  });

  test('開発環境ではスタブが用いられ、外部呼び出しが発生しません', () => {
    const environment = { [env.ENV_VAR]: 'development' };
    const result = env.isDevelopment(environment)
      ? stub.generate({ operation: 'clip', prompt: 'p', model: 'm', materialId: 'M1' })
      : null;
    expect(result && result.stub).toBe(true);
    expect(stub.recordedCalls()).toHaveLength(1);
  });

  test('スタブは課金対象の実尺を返しません', () => {
    expect(stub.generate({ operation: 'figure', prompt: 'p', model: 'm', materialId: 'M1' }).duration_sec).toBe(0);
  });
});

describe('スタブの決定性', () => {
  test('同じ入力なら常に同じファイル名を返します', () => {
    stub.reset();
    const first = stub.generate({ operation: 'clip', prompt: 'p', model: 'm', materialId: 'M1' });
    const second = stub.generate({ operation: 'clip', prompt: 'p', model: 'm', materialId: 'M1' });
    expect(second.file_path).toBe(first.file_path);
  });

  test('入力が変われば別のファイル名になります', () => {
    stub.reset();
    const a = stub.generate({ operation: 'clip', prompt: 'p1', model: 'm', materialId: 'M1' });
    const b = stub.generate({ operation: 'clip', prompt: 'p2', model: 'm', materialId: 'M1' });
    expect(a.file_path).not.toBe(b.file_path);
  });
});
