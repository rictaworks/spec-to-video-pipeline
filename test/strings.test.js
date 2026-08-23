const { t, resetCache } = require('../src/skills/spec-to-video/scripts/lib/strings.js');

beforeEach(() => {
  resetCache();
});

describe('文言の取得', () => {
  test('設定ファイルの文言を返します', () => {
    expect(t('common.gate_blocked', { phase: 'P5' })).toBe('工程 P5 の入口ゲートで停止しました。');
  });

  test('差し込み値を反映します', () => {
    expect(t('common.ledger_not_found', { path: 'data/clips.json' })).toContain('data/clips.json');
  });

  test('未定義のキーは代替文言へ切り替えずに例外になります', () => {
    expect(() => t('does.not.exist')).toThrow();
  });

  test('差し込み値が不足する場合も例外になります', () => {
    expect(() => t('common.gate_blocked')).toThrow(/missing parameter/);
  });
});
