const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const specDir = path.join(repoRoot, 'SPEC');
const CR = String.fromCharCode(13);

/**
 * @param {string} file
 * @returns {string}
 */
function read(file) {
  return fs.readFileSync(file, 'utf8').split(CR).join('');
}

describe('SPEC の図', () => {
  const files = fs.readdirSync(specDir).filter((name) => name.endsWith('.md'));

  test('6種類の図を用意しています', () => {
    expect(files.sort()).toEqual([
      'data-flow.md',
      'data-model.md',
      'module.md',
      'sequence.md',
      'state.md',
      'use-case.md',
    ]);
  });

  test.each([
    ['data-model.md', 'erDiagram'],
    ['data-flow.md', 'flowchart'],
    ['sequence.md', 'sequenceDiagram'],
    ['state.md', 'stateDiagram-v2'],
    ['use-case.md', 'graph TD'],
    ['module.md', 'classDiagram'],
  ])('%s は %s を含みます', (file, marker) => {
    const source = read(path.join(specDir, file));
    expect(source).toContain('```mermaid');
    expect(source).toContain(marker);
  });

  test('図が参照するスクリプトは実在します', () => {
    const skillScripts = path.join(repoRoot, 'src', 'skills', 'spec-to-video', 'scripts');
    ['parse_design_doc', 'ledger_validate', 'synthesize_narration', 'build_subtitles', 'generate_asset', 'render_video', 'analyze_frames'].forEach((name) => {
      expect(fs.existsSync(path.join(skillScripts, `${name}.js`))).toBe(true);
    });
  });

  test('絵文字を使いません', () => {
    files.forEach((file) => {
      expect(/\p{Extended_Pictographic}/u.test(read(path.join(specDir, file)))).toBe(false);
    });
  });
});

describe('監視用クエリ集', () => {
  const source = read(path.join(repoRoot, 'src', 'skills', 'spec-to-video', 'docs', 'monitoring-queries.md'));

  test('発火すべきクエリと、すべきでないクエリを分けています', () => {
    expect(source).toContain('発火すべきクエリ');
    expect(source).toContain('発火すべきでないクエリ');
  });

  test('参照ファイル未読時の停止を確認する手順があります', () => {
    expect(source).toContain('参照ファイル未読時の確認');
    expect(source).toContain('ゲートで停止すること');
  });

  test('ホスト間の挙動差の確認手順があります', () => {
    expect(source).toContain('ホスト間の挙動差');
    expect(source).toContain('差し戻し先');
  });
});
