const fs = require('node:fs');
const path = require('node:path');

const skillRoot = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video');
// 改行コードの違いに左右されないよう、復帰文字を取り除いて検査します。
const CR = String.fromCharCode(13);
const source = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8').split(CR).join('');


/**
 * frontmatter を読み取ります。
 * @returns {Record<string, string>}
 */
function frontmatter() {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (match === null) throw new Error('frontmatter がありません');
  /** @type {Record<string, string>} */
  const result = {};
  match[1].split('\n').forEach((line) => {
    const at = line.indexOf(':');
    if (at > 0) result[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  });
  return result;
}

describe('frontmatter', () => {
  test('name と description を備えます', () => {
    const meta = frontmatter();
    expect(meta.name).toBe('spec-to-video');
    expect(meta.description.length).toBeGreaterThan(50);
  });

  test('description に何をするかと、使う場面を含みます', () => {
    const description = frontmatter().description;
    expect(description).toContain('動画設計書');
    expect(description).toContain('mp4');
    expect(description).toContain('使用します');
    expect(description).toContain('使用しません');
  });
});

describe('工程の記載', () => {
  test.each(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16'])(
    '%s を記載しています',
    (phase) => {
      expect(source).toContain(`| ${phase} |`);
    },
  );

  test('決定木・工程フロー・出力先の確定の3つの図を含みます', () => {
    expect(source.match(/```mermaid/g)).toHaveLength(3);
  });
});

describe('参照ファイルの指示', () => {
  test.each([
    'references/design-doc-schema.md',
    'references/narration-subtitles.md',
    'references/cost-and-credentials.md',
    'references/mode-generative.md',
    'references/mode-remotion-only.md',
    'references/remotion-project.md',
    'references/compliance-review.md',
  ])('%s の読み込み条件を示しています', (file) => {
    expect(source).toContain(file);
  });

  test('モード別の参照は一方のみを読む構成です', () => {
    expect(source).toContain('一方のみを読み込みます');
  });

  test('参照ファイルが実在します', () => {
    const referenced = Array.from(source.matchAll(/references\/[\w-]+\.md/g)).map((m) => m[0]);
    Array.from(new Set(referenced)).forEach((file) => {
      expect(fs.existsSync(path.join(skillRoot, file))).toBe(true);
    });
  });

  test('指示するスクリプトが実在します', () => {
    const referenced = Array.from(source.matchAll(/scripts\/[\w-]+\.js/g)).map((m) => m[0]);
    Array.from(new Set(referenced)).forEach((file) => {
      expect(fs.existsSync(path.join(skillRoot, file))).toBe(true);
    });
  });
});

describe('設計要件の明記', () => {
  test.each([
    ['推測で補完しません', '推測補完の禁止'],
    ['承認ゲート', '承認ゲート'],
    ['再生成せず既存素材を用います', '冪等性'],
    ['再レンダリングで解消できる不適合に、再生成を選びません', '差し戻しの最小化'],
    ['環境変数名のみ', '秘匿'],
  ])('%s を記載しています（%s）', (phrase) => {
    expect(source).toContain(phrase);
  });

  test('差し戻しルーティングの表を含みます', () => {
    expect(source).toContain('差し戻しルーティング');
    expect(source).toContain('トランジション区間');
  });
});

describe('分量と文体', () => {
  test('500行以内です', () => {
    expect(source.split('\n').length).toBeLessThanOrEqual(500);
  });

  test('絵文字を使いません', () => {
    expect(/\p{Extended_Pictographic}/u.test(source)).toBe(false);
  });
});

describe('未決事項の尋ね方', () => {
  const template = fs
    .readFileSync(path.join(skillRoot, 'assets', 'question.template.md'), 'utf8')
    .split(CR)
    .join('');

  test('SKILL.md に尋ねる旨を明記しています', () => {
    expect(source).toContain('未決事項は尋ねます');
    expect(source).toContain('回答を待たずに既定値で進めません');
  });

  test('尋ねる雛形を参照しています', () => {
    expect(source).toContain('assets/question.template.md');
    expect(fs.existsSync(path.join(skillRoot, 'assets', 'question.template.md'))).toBe(true);
  });

  test.each([
    '決まっていないこと',
    'なぜ必要か',
    '選択肢',
    '推奨',
  ])('雛形に %s の欄があります', (heading) => {
    expect(template).toContain(heading);
  });

  test('選択肢を示せない場合の扱いが雛形にあります', () => {
    expect(template).toContain('選択肢を示せない場合');
    expect(template).toContain('必要な情報は何か');
  });

  test('資料が矛盾する場合は両方の記述を並べます', () => {
    expect(template).toContain('資料が矛盾している場合');
    expect(template).toContain('両方の記述をそのまま並べて');
  });

  test('回答の根拠を実行レポートへ記録する旨があります', () => {
    expect(template).toContain('実行レポート');
  });
});
