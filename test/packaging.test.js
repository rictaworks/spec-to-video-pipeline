const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const builder = require('../scripts/build-skill-package.js');

describe('バージョン番号の形式', () => {
  test.each(['01.01.00', '02.13.07', '10.00.99'])('%s を受け付けます', (version) => {
    expect(() => builder.assertVersion(version)).not.toThrow();
  });

  test.each(['1.1.0', 'v01.01.00', '01.01', '01.01.000', ''])('%s を拒否します', (version) => {
    expect(() => builder.assertVersion(version)).toThrow();
  });
});

describe('同梱の可否', () => {
  test.each(['SKILL.md', 'scripts/parse_design_doc.js', 'assets/clips.schema.json'])(
    '%s は同梱します',
    (name) => {
      expect(builder.shouldInclude(path.basename(name))).toBe(true);
    },
  );

  test.each(['.gitkeep', 'strings.test.js', 'env.spec.js', '.DS_Store'])('%s は同梱しません', (name) => {
    expect(builder.shouldInclude(name)).toBe(false);
  });
});

describe('同梱ファイルの収集', () => {
  const files = builder.collectFiles(builder.SKILL_DIR);

  test('SKILL.md を含みます', () => {
    expect(files).toContain('SKILL.md');
  });

  test('参照ファイルとスクリプトを含みます', () => {
    expect(files).toContain('references/design-doc-schema.md');
    expect(files).toContain('scripts/generate_asset.js');
    expect(files).toContain('scripts/lib/strings.js');
  });

  test('開発用のファイルを含みません', () => {
    expect(files.some((file) => file.endsWith('.gitkeep'))).toBe(false);
    expect(files.some((file) => file.endsWith('.test.js'))).toBe(false);
  });
});

describe('配布物の組み立て', () => {
  test('バージョンを含むファイル名で書き出し、設置先を示します', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpkg-'));
    const result = await builder.buildPackage({ version: '01.01.00', outputDir });
    expect(path.basename(result.package_path)).toBe('spec-to-video-01.01.00.skill');
    expect(fs.statSync(result.package_path).size).toBeGreaterThan(0);
    expect(result.install_path).toContain('skills/spec-to-video');
  });
});

describe('ライセンスの同梱', () => {
  test('配布物の一覧に LICENSE と NOTICE が含まれます', async () => {
    const fsx = require('node:fs');
    const osx = require('node:os');
    const pathx = require('node:path');
    const outputDir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'skillpkg-license-'));
    const result = await builder.buildPackage({ version: '01.01.00', outputDir });
    expect(result.files).toContain('LICENSE');
    expect(result.files).toContain('NOTICE');
  });

  test('LICENSE は Apache License 2.0 です', () => {
    const text = require('node:fs').readFileSync('LICENSE', 'utf8');
    expect(text).toContain('Apache License');
    expect(text).toContain('Version 2.0');
  });

  test('NOTICE に個人名を含めません', () => {
    const text = require('node:fs').readFileSync('NOTICE', 'utf8');
    expect(text).toContain('Ricta Works');
    expect(text).toContain('info@rictaworks.jp');
  });

  test('package.json のライセンス宣言が一致します', () => {
    const pkg = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8'));
    expect(pkg.license).toBe('Apache-2.0');
  });
});
