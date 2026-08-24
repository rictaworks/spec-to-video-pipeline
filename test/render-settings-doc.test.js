const fs = require('node:fs');
const path = require('node:path');

const CR = String.fromCharCode(13);
const skillDir = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video');

/**
 * @param {string} file
 * @returns {string}
 */
function read(file) {
  return fs.readFileSync(file, 'utf8').split(CR).join('');
}

describe('レンダリング設定の定め', () => {
  const doc = read(path.join(skillDir, 'references', 'remotion-project.md'));

  test('P12 で明示する設定の節があります', () => {
    expect(doc).toContain('## 7. レンダリングの設定と素材の描画');
    expect(doc).toContain('### 6.1 既定値に任せない設定');
  });

  test.each(['並列度', 'フレーム取得の待ち時間', '動画の先読み量'])(
    '%s を明示する旨を定めています',
    (item) => {
      expect(doc).toContain(item);
    },
  );

  test('既定値が実行機の資源から決まることを述べています', () => {
    expect(doc).toContain('実装メモリ');
  });

  test('クリップの描画に用いる要素の選定基準があります', () => {
    expect(doc).toContain('### 6.3 クリップの描画に用いる要素');
    expect(doc).toContain('OffthreadVideo');
    expect(doc).toContain('Video');
  });

  test('ブラウザ側で復号する場合に読み込み待ちを必須としています', () => {
    expect(doc).toContain('読み込み待ちの指定が必須');
    expect(doc).toContain('先頭フレームが黒く');
  });

  test('資源不足の見分け方を定めています', () => {
    expect(doc).toContain('### 6.2 資源不足の見分け方');
    expect(doc).toContain('実行のたびに別の素材で停止する');
  });

  test('資源不足の症状で素材を再生成しない旨を明記しています', () => {
    expect(doc).toContain('この症状で素材を再生成しません');
  });

  test('前提ゲートで実行機の資源を確認する旨を定めています', () => {
    expect(doc).toContain('### 6.4 前提ゲート（P2）での確認');
    expect(doc).toContain('空きメモリ');
  });
});

describe('差し戻しと入口ゲート', () => {
  const skill = read(path.join(skillDir, 'SKILL.md'));

  test('資源不足の差し戻し先を P12 としています', () => {
    expect(skill).toContain('復号が止まる・健全な素材が読めない');
    expect(skill).toContain('実行環境の資源不足');
  });

  test('P2 の入口ゲートに実行機の資源を含めています', () => {
    expect(skill).toContain('実行機の資源が確定していること');
  });

  test('P2 で remotion-project.md の 6 章を読む旨を記しています', () => {
    expect(skill).toContain('P2（6章のみ）');
  });
});
