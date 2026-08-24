const fs = require('node:fs');
const path = require('node:path');

const CR = String.fromCharCode(13);
const skillDir = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video');

/**
 * @param {string} file
 * @returns {string}
 */
function read(file) {
  return fs.readFileSync(path.join(skillDir, file), 'utf8').split(CR).join('');
}

describe('シーン境界の重ね方', () => {
  const doc = read('references/remotion-project.md');

  test('重ね方を定めた節があります', () => {
    expect(doc).toContain('### 5.1 重ね方');
  });

  test('前のシーンを不透明のまま残す旨を定めています', () => {
    expect(doc).toContain('前のシーンを不透明のまま残し、次のシーンだけを重ねて増やします');
  });

  test('前後を同時に半透明にする実装を禁じています', () => {
    expect(doc).toContain('同時に増減させる実装');
    expect(doc).toContain('してはいけません');
  });

  test('下地が透けて輝度が沈むことを述べています', () => {
    expect(doc).toContain('下地の背景色が透けて輝度が沈みます');
  });

  test('前のシーンの最後のカットを重なりの分だけ表示し続ける旨を定めています', () => {
    expect(doc).toContain('最後のカットは、重なりの長さだけ表示し続けます');
  });

  test('表示を切ると同じ症状が出ることを述べています', () => {
    expect(doc).toContain('そこが下地になり');
  });

  test('差し戻し先を P11 とし、素材を再生成しない旨を定めています', () => {
    expect(doc).toContain('### 5.2 検出されたときの差し戻し');
    expect(doc).toContain('素材を再生成しても直りません');
  });
});

describe('差し戻しルーティング', () => {
  test('SKILL.md にシーン境界の輝度低下の行があります', () => {
    const skill = read('SKILL.md');
    expect(skill).toContain('シーン境界で輝度が沈む');
    expect(skill).toContain('前後を同時に半透明にしている');
  });

  test('compliance-review.md の検出結果の読み方にも同じ行があります', () => {
    const doc = read('references/compliance-review.md');
    expect(doc).toContain('シーン境界で輝度が沈む');
  });
});
