'use strict';

/**
 * 工程 P1: 動画設計書を正規化構造へ変換します。
 * 必須項目が抽出できない場合、推測で補完せず欠損を列挙して停止します。
 */

const fs = require('node:fs');
const path = require('node:path');
const { extractTables } = require('./lib/markdown-table.js');
const { t } = require('./lib/strings.js');

const SYNONYMS_PATH = path.join(__dirname, '..', 'config', 'design-doc-synonyms.json');
const PARSING_PATH = path.join(__dirname, '..', 'config', 'parsing.json');

const SCENE_REQUIRED = [
  'scene_id',
  'duration_sec',
  'material_kind',
  'material_count',
  'visual',
  'subtitles',
  'narration_policy',
  'intentional_luminance_change',
];
const META_REQUIRED = ['repository', 'edition', 'production_mode', 'models'];
const OUTPUT_REQUIRED = ['resolution', 'fps', 'codec', 'audio'];
const COST_REQUIRED = ['retry_limit', 'hard_cap'];
const NARRATION_REQUIRED = ['engine', 'speaker'];

/**
 * 正規表現で使う文字を退避します。
 * @param {string} value
 * @returns {string}
 */
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[]\]/g, String.raw`$&`);
}

/**
 * 照合用に表記を揃えます。全角・半角、大文字・小文字、空白の違いを無視します。
 * @param {string} value
 * @returns {string}
 */
function normalizeKey(value) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[()]/g, '');
}

/**
 * 同義語辞書を読み込みます。
 * @returns {Record<string, string[]>}
 */
function loadSynonyms() {
  return JSON.parse(fs.readFileSync(SYNONYMS_PATH, 'utf8'));
}

/**
 * 読み取りに用いる語彙を読み込みます。判定に使う語をスクリプトへ直書きしないための設定です。
 * @returns {{truthy_values: string[], subtitle_separators: string[]}}
 */
function loadParsingRules() {
  return JSON.parse(fs.readFileSync(PARSING_PATH, 'utf8'));
}

/**
 * 列名を正規化した項目名へ変換します。対応が付かない場合は null を返します。
 * @param {string} column
 * @param {Record<string, string[]>} synonyms
 * @returns {string | null}
 */
function resolveColumn(column, synonyms) {
  const target = normalizeKey(column);
  for (const [field, aliases] of Object.entries(synonyms)) {
    if (normalizeKey(field) === target) return field;
    if (aliases.some((alias) => normalizeKey(alias) === target)) return field;
  }
  return null;
}

/**
 * 数値を厳密に読み取ります。単位や前置きは許容しますが、範囲や区切りを含む記述は
 * 別の数値へ丸めず null を返し、欠損として扱わせます。
 * @param {string} raw
 * @returns {number | null}
 */
function parseNumeric(raw) {
  const pattern = new RegExp("^[^0-9]*([0-9]+(?:[.][0-9]+)?)[^0-9]*$");
  const match = raw.normalize('NFKC').trim().match(pattern);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * シーン構成表かどうかを判定します。
 * @param {{headers: string[], rows: string[][]}} table
 * @param {Record<string, string[]>} synonyms
 * @returns {boolean}
 */
function isSceneTable(table, synonyms) {
  const mapped = table.headers.map((header) => resolveColumn(header, synonyms));
  return mapped.includes('scene_id') && mapped.includes('duration_sec');
}

/**
 * 真偽を表す記述を判定します。
 * @param {string} value
 * @returns {boolean}
 */
function parseBoolean(value) {
  return loadParsingRules().truthy_values.map(normalizeKey).includes(normalizeKey(value));
}

/**
 * 2列の表を項目と値の対応として読み取ります。
 * @param {{headers: string[], rows: string[][]}[]} tables
 * @param {Record<string, string[]>} synonyms
 * @returns {{values: Record<string, string>, unknownColumns: string[]}}
 */
function collectKeyValues(tables, synonyms) {
  /** @type {Record<string, string>} */
  const values = {};
  /** @type {string[]} */
  const unknownColumns = [];
  tables
    .filter((table) => table.headers.length === 2 && !isSceneTable(table, synonyms))
    .forEach((table) => {
      table.rows.forEach((row) => {
        if (row.length < 2) return;
        const field = resolveColumn(row[0], synonyms);
        if (field === null) {
          unknownColumns.push(row[0]);
          return;
        }
        values[field] = row[1];
      });
    });
  return { values, unknownColumns };
}

/**
 * シーン構成表を読み取ります。
 * @param {{headers: string[], rows: string[][]}[]} tables
 * @param {Record<string, string[]>} synonyms
 * @returns {{scenes: Record<string, any>[], unknownColumns: string[]}}
 */
function collectScenes(tables, synonyms) {
  /** @type {Record<string, any>[]} */
  const scenes = [];
  /** @type {string[]} */
  const unknownColumns = [];
  tables.forEach((table) => {
    const mapped = table.headers.map((header) => resolveColumn(header, synonyms));
    if (!mapped.includes('scene_id') || !mapped.includes('duration_sec')) return;
    mapped.forEach((field, index) => {
      if (field === null) unknownColumns.push(table.headers[index]);
    });
    table.rows.forEach((row) => {
      /** @type {Record<string, any>} */
      const scene = {};
      mapped.forEach((field, index) => {
        if (field === null || row[index] === undefined) return;
        const raw = row[index];
        if (field === 'duration_sec' || field === 'material_count') {
          const numeric = parseNumeric(raw);
          if (numeric !== null) scene[field] = numeric;
          return;
        }
        if (field === 'subtitles') {
          scene[field] = raw.split(/<br>|\/|、/).map((line) => line.trim()).filter(Boolean);
          return;
        }
        if (field === 'intentional_luminance_change') {
          scene[field] = parseBoolean(raw);
          return;
        }
        scene[field] = raw;
      });
      if (scene.scene_id !== undefined && String(scene.scene_id).trim() !== '') scenes.push(scene);
    });
  });
  return { scenes, unknownColumns };
}

/**
 * 動画設計書を正規化します。欠損がある場合は例外を投げます。
 * @param {string} markdown
 * @returns {Record<string, any>}
 */
function parseDesignDoc(markdown) {
  const synonyms = loadSynonyms();
  const tables = extractTables(markdown);
  const keyValues = collectKeyValues(tables, synonyms);
  const sceneResult = collectScenes(tables, synonyms);

  if (sceneResult.scenes.length === 0) throw new Error(t('parse.no_scenes'));

  /** @type {string[]} */
  const missing = [];
  /**
   * @param {string[]} fields
   * @returns {Record<string, any>}
   */
  const pick = (fields) => {
    /** @type {Record<string, any>} */
    const picked = {};
    fields.forEach((field) => {
      const value = keyValues.values[field];
      if (value === undefined || value === '') {
        missing.push(field);
        return;
      }
      picked[field] = value;
    });
    return picked;
  };

  const meta = pick(META_REQUIRED);
  const outputSpec = pick(OUTPUT_REQUIRED);
  const costPolicy = pick(COST_REQUIRED);
  const narration = pick(NARRATION_REQUIRED);

  sceneResult.scenes.forEach((scene) => {
    SCENE_REQUIRED.forEach((field) => {
      if (scene[field] === undefined || scene[field] === '') {
        missing.push(`${String(scene.scene_id)}.${field}`);
      }
    });
  });

  if (missing.length > 0) throw new Error(t('parse.missing_fields', { fields: missing.join(', ') }));

  if (keyValues.values.title_candidates !== undefined) {
    meta.title_candidates = keyValues.values.title_candidates;
  }

  return {
    meta,
    scenes: sceneResult.scenes,
    output_spec: outputSpec,
    cost_policy: costPolicy,
    narration,
    unknown_columns: Array.from(new Set([...keyValues.unknownColumns, ...sceneResult.unknownColumns])),
  };
}

module.exports = {
  parseDesignDoc,
  resolveColumn,
  normalizeKey,
  loadSynonyms,
  loadParsingRules,
  parseNumeric,
  isSceneTable,
};
