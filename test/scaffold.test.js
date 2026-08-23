const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const skillRoot = path.join(repoRoot, 'src', 'skills', 'spec-to-video');

/** @returns {{engines?: {node?: string}, scripts?: Record<string, string>}} */
function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
}

describe('スキルの雛形', () => {
  test.each(['references', 'scripts', 'assets', 'config', 'docs'])(
    '%s ディレクトリが存在します',
    (name) => {
      expect(fs.existsSync(path.join(skillRoot, name))).toBe(true);
    },
  );
});

describe('package.json', () => {
  test('実行に必要な Node のバージョンを明記しています', () => {
    const pkg = readPackageJson();
    expect(pkg.engines && pkg.engines.node).toBeDefined();
  });

  test('test と typecheck のスクリプトを定義しています', () => {
    const pkg = readPackageJson();
    expect(pkg.scripts && pkg.scripts.test).toBeDefined();
    expect(pkg.scripts && pkg.scripts.typecheck).toBeDefined();
  });
});
