const fs = require('node:fs');
const path = require('node:path');

const CR = String.fromCharCode(13);
const skillPath = path.join(__dirname, '..', 'src', 'skills', 'spec-to-video', 'SKILL.md');
const source = fs.readFileSync(skillPath, 'utf8').split(CR).join('');

describe('出力先の確定', () => {
  test('P2 で確定する節があります', () => {
    expect(source).toContain('## 出力先の確定（P2）');
  });

  test('案件ごとに違う旨を述べています', () => {
    expect(source).toContain('案件ごとに違います');
  });

  test('先に資料を読む順序を定めています', () => {
    expect(source).toContain('先に資料を読みます');
    expect(source).toContain('設計書・絵コンテ・企画書');
  });

  test('定めがあれば尋ねない旨を明記しています', () => {
    expect(source).toContain('それに従います。尋ねません');
  });

  test('定めが無い場合にかぎり尋ねる旨を定めています', () => {
    expect(source).toContain('定めが無い場合にかぎり、選択肢を添えて尋ねます');
  });

  test('既定の置き場を第1候補として示す旨を定めています', () => {
    expect(source).toContain('既定の置き場を第1候補');
  });

  test('どこに定めがあったかを実行レポートへ記録する旨を定めています', () => {
    expect(source).toContain('設計書のどこに定めがあったか');
  });

  test('確定していない状態で P12 へ進まない旨を定めています', () => {
    expect(source).toContain('出力先が確定していない状態で P12 へ進みません');
  });

  test('P2 の入口ゲートに出力先を含めています', () => {
    expect(source).toContain('上限・実行機の資源・出力先が確定していること');
  });

  test('出力の節が既定の候補である旨を述べています', () => {
    expect(source).toContain('置き場は**既定の候補**です');
  });

  test('確定の流れを図で示しています', () => {
    expect(source).toContain('A[P2 出力先の確定]');
  });
});

describe('二重確認の禁止', () => {
  test('尋ねる前に資料を読む旨を定めています', () => {
    expect(source).toContain('尋ねる前に、設計書・絵コンテ・企画書を読みます');
    expect(source).toContain('二重確認');
  });
});
