const fs = require('node:fs');
const path = require('node:path');

const CR = String.fromCharCode(13);
const refDir = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video', 'references');

/**
 * @param {string} file
 * @returns {string}
 */
function read(file) {
  return fs.readFileSync(path.join(refDir, file), 'utf8').split(CR).join('');
}

describe('テロップのフチ', () => {
  const doc = read('remotion-project.md');

  test('幅を字の大きさに対する比で定めています', () => {
    expect(doc).toContain('#### フチの幅');
    expect(doc).toContain('字の大きさに対する比で定めます');
  });

  test('固定値で書かないことを明記しています', () => {
    expect(doc).toContain('固定値で書きません');
  });

  test('潰れが機械検証で検出されないことを述べています', () => {
    expect(doc).toContain('機械検証（P13）では検出されません');
  });

  test('外フチの色を白のみに限定しない旨を定めています', () => {
    expect(doc).toContain('#### フチの色');
    expect(doc).toContain('白のみの指定を認めません');
  });

  test('外フチの指定から白を外しています', () => {
    expect(doc).toContain('外側に差し色を置きます');
    expect(doc).not.toContain('外側に白または差し色');
  });
});

describe('常設テロップと図解の重なり', () => {
  const doc = read('remotion-project.md');

  test('下端の帯を定め、図解を掛からない範囲へ収める旨を記しています', () => {
    expect(doc).toContain('#### 常設テロップと図解の重なり');
    expect(doc).toContain('この帯に掛からない範囲へ収めます');
  });

  test('クリップは全面のままでよい旨を記しています', () => {
    expect(doc).toContain('クリップは全面のまま');
  });

  test('図解の文言が隠れてよい情報ではない旨を記しています', () => {
    expect(doc).toContain('隠れてよい情報ではありません');
  });
});

describe('判読性の確認', () => {
  test('remotion-project.md が双方の背景での確認を求めています', () => {
    const doc = read('remotion-project.md');
    expect(doc).toContain('#### 判読性の確認');
    expect(doc).toContain('暗い実写カットと淡色の図解カットの双方');
  });

  test('人間審査の項目に含めています', () => {
    const doc = read('compliance-review.md');
    expect(doc).toContain('テロップの判読性の確認');
    expect(doc).toContain('図解の文言に重なっていないことの確認');
  });
});
