const { parseDesignDoc, resolveColumn, loadSynonyms } = require('../src/skills/spec-to-video/scripts/parse_design_doc.js');

const VALID_DOC = [
  '# 動画設計書',
  '',
  '| 項目 | 内容 |',
  '|---|---|',
  '| リポジトリ | sample-repo |',
  '| エディション | full |',
  '| 制作モード | generative |',
  '| 使用モデル | veo, nano banana |',
  '| 解像度 | 1920x1080 |',
  '| フレームレート | 30 |',
  '| コーデック | H.264 |',
  '| 音声 | なし |',
  '| リトライ上限 | 3 |',
  '| 課金上限 | 5000 |',
  '| 合成エンジン | local-tts |',
  '| 話者 | 四国めたん |',
  '',
  '| シーン | 尺 | 種別 | カット数 | 映像 | 字幕 | ナレーション | 意図的な輝度変化 |',
  '|---|---|---|---|---|---|---|---|',
  '| S1 | 8 | clip | 2 | 街の遠景 | ここから始まります | 導入を読みます | なし |',
  '| S2 | 12 | figure | 1 | 構成図 | 三つの手順です | 手順を読みます | あり |',
].join('\n');

describe('列名の正規化', () => {
  const synonyms = loadSynonyms();

  test.each([
    ['尺', 'duration_sec'],
    ['長さ', 'duration_sec'],
    ['秒数', 'duration_sec'],
    ['ＦＰＳ', 'fps'],
    ['シーンID', 'scene_id'],
  ])('%s を %s として扱います', (column, expected) => {
    expect(resolveColumn(column, synonyms)).toBe(expected);
  });

  test('辞書に無い列名は対応させません', () => {
    expect(resolveColumn('担当者', synonyms)).toBeNull();
  });
});

describe('正常な設計書の正規化', () => {
  const result = parseDesignDoc(VALID_DOC);

  test('メタ情報を抽出します', () => {
    expect(result.meta.production_mode).toBe('generative');
    expect(result.meta.repository).toBe('sample-repo');
  });

  test('出力規格とコスト方針とナレーション設定を抽出します', () => {
    expect(result.output_spec.fps).toBe('30');
    expect(result.cost_policy.hard_cap).toBe('5000');
    expect(result.narration.speaker).toBe('四国めたん');
  });

  test('シーンを抽出し、数値と真偽を変換します', () => {
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0].duration_sec).toBe(8);
    expect(result.scenes[0].material_count).toBe(2);
    expect(result.scenes[0].intentional_luminance_change).toBe(false);
    expect(result.scenes[1].intentional_luminance_change).toBe(true);
  });

  test('字幕を行に分割します', () => {
    expect(result.scenes[0].subtitles).toEqual(['ここから始まります']);
  });
});

describe('欠損時の扱い', () => {
  test('必須項目が欠けている場合は補完せず停止します', () => {
    const doc = VALID_DOC.replace('| 制作モード | generative |\n', '');
    expect(() => parseDesignDoc(doc)).toThrow(/production_mode/);
  });

  test('シーン側の必須項目が欠けている場合も停止します', () => {
    const doc = VALID_DOC.replace('| S2 | 12 | figure | 1 | 構成図 | 三つの手順です | 手順を読みます | あり |', '| S2 | 12 | figure | 1 | 構成図 | 三つの手順です |  | あり |');
    expect(() => parseDesignDoc(doc)).toThrow(/S2\.narration_policy/);
  });

  test('シーン構成表が無い場合は停止します', () => {
    expect(() => parseDesignDoc('# 設計書\n\n本文のみです。')).toThrow();
  });

  test('辞書に無い列名を記録します', () => {
    const doc = VALID_DOC.replace('| 項目 | 内容 |', '| 項目 | 内容 |').replace('| 話者 | 四国めたん |', '| 話者 | 四国めたん |\n| 担当者 | 未定 |');
    expect(parseDesignDoc(doc).unknown_columns).toContain('担当者');
  });
});
