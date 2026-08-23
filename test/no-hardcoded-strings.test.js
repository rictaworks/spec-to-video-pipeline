const fs = require('node:fs');
const path = require('node:path');

/**
 * スクリプト内に日本語の文字列リテラルが直書きされていないことを検査します。
 * 文言は config/messages.json に分離し、scripts/lib/strings.js 経由で取得します。
 */

const scriptsDir = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video', 'scripts');
const JAPANESE = /[぀-ゟ゠-ヿ一-鿿]/;

/**
 * 検査対象のスクリプトを再帰的に集めます。
 * @param {string} dir
 * @returns {string[]}
 */
function collectScripts(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectScripts(full);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

/**
 * コメントを除いた行から、日本語を含む文字列リテラルを抽出します。
 * @param {string} source
 * @returns {{line: number, literal: string}[]}
 */
function findJapaneseLiterals(source) {
  /** @type {{line: number, literal: string}[]} */
  const found = [];
  source.split('\n').forEach((line, index) => {
    const withoutComment = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    const literals = withoutComment.match(/'[^']*'|"[^"]*"|`[^`]*`/g) || [];
    literals.filter((literal) => JAPANESE.test(literal)).forEach((literal) => {
      found.push({ line: index + 1, literal });
    });
  });
  return found;
}

describe('文字列リテラルのハードコード検査', () => {
  const scripts = collectScripts(scriptsDir);

  test('検査対象のスクリプトを検出できています', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  test.each(scripts.map((file) => [path.relative(scriptsDir, file), file]))(
    '%s に日本語の文字列リテラルがありません',
    (_name, file) => {
      const found = findJapaneseLiterals(fs.readFileSync(file, 'utf8'));
      expect(found).toEqual([]);
    },
  );
});

describe('検査ロジックの妥当性', () => {
  test('日本語の文字列リテラルを検出します', () => {
    expect(findJapaneseLiterals("const a = '未設定です';")).toHaveLength(1);
  });

  test('コメント中の日本語は検出しません', () => {
    expect(findJapaneseLiterals("const a = 1; // 台帳を読み込みます")).toEqual([]);
  });

  test('英字のみの文字列リテラルは検出しません', () => {
    expect(findJapaneseLiterals("const a = 'utf8';")).toEqual([]);
  });
});
