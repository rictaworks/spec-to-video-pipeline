'use strict';

/**
 * 配布物（.skill）を組み立てます。開発用のファイルを同梱しません。
 * リポジトリ直下の scripts/ に置き、スキル本体（src/skills/）とは分離しています。
 */

const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');

const REPO_ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(REPO_ROOT, 'src', 'skills', 'spec-to-video');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const VERSION_PATTERN = /^\d{2}\.\d{2}\.\d{2}$/;

/** 同梱しないファイル名です。 */
const EXCLUDED_NAMES = ['.gitkeep', '.DS_Store'];
/** 同梱しない拡張子です。 */
const EXCLUDED_SUFFIXES = ['.test.js', '.spec.js'];

/**
 * 同梱するかどうかを判定します。
 * @param {string} name
 * @returns {boolean}
 */
function shouldInclude(name) {
  if (EXCLUDED_NAMES.includes(name)) return false;
  return !EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * 同梱するファイルの相対パスを集めます。
 * @param {string} dir
 * @param {string} [base]
 * @returns {string[]}
 */
function collectFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full, base);
    if (!entry.isFile() || !shouldInclude(entry.name)) return [];
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

/**
 * バージョン番号の形式を検査します。
 * @param {string} version
 */
function assertVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`version must be NN.NN.NN, got "${version}"`);
  }
}

/**
 * 配布物を書き出します。
 * @param {{version: string, outputDir?: string}} input
 * @returns {Promise<{package_path: string, files: string[], install_path: string}>}
 */
async function buildPackage(input) {
  assertVersion(input.version);
  const outputDir = input.outputDir || DIST_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const files = collectFiles(SKILL_DIR).sort();
  if (!files.includes('SKILL.md')) {
    throw new Error('SKILL.md is required in the package');
  }
  const packagePath = path.join(outputDir, `spec-to-video-${input.version}.skill`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(packagePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(undefined));
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    // 配布条件を配布物にも同梱します。
    ['LICENSE', 'NOTICE'].forEach((name) => {
      archive.file(path.join(REPO_ROOT, name), { name });
    });
    files.forEach((file) => {
      archive.file(path.join(SKILL_DIR, file), { name: file });
    });
    archive.finalize();
  });
  return {
    package_path: packagePath,
    files: files.concat(['LICENSE', 'NOTICE']),
    install_path: '~/.claude/skills/spec-to-video/',
  };
}

if (require.main === module) {
  buildPackage({ version: process.argv[2] })
    .then((result) => {
      process.stdout.write(`${result.package_path}
`);
      process.stdout.write(`files: ${result.files.length}
`);
      process.stdout.write(`install to: ${result.install_path}
`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}
`);
      process.exitCode = 1;
    });
}

module.exports = { buildPackage, collectFiles, shouldInclude, assertVersion, VERSION_PATTERN, SKILL_DIR };
