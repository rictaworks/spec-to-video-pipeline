'use strict';

/**
 * 利用者に見える文言を設定ファイルから取得します。
 * スクリプト側に文言を直書きしないための唯一の入口です。
 */

const fs = require('node:fs');
const path = require('node:path');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'config', 'messages.json');

/** @type {Record<string, string> | null} */
let cache = null;

/**
 * 文言カタログを読み込みます。読み込めない場合は例外を投げます。
 * @returns {Record<string, string>}
 */
function loadCatalog() {
  if (cache !== null) {
    return cache;
  }
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${CATALOG_PATH} is not an object`);
  }
  cache = /** @type {Record<string, string>} */ (parsed);
  return cache;
}

/**
 * 文言を取得し、差し込み値を反映します。
 * キーが未定義の場合も差し込み値が不足する場合も、代替文言へ切り替えずに例外を投げます。
 * @param {string} key 文言キー
 * @param {Record<string, string | number>} [params] 差し込み値
 * @returns {string}
 */
function t(key, params = {}) {
  const catalog = loadCatalog();
  const template = catalog[key];
  if (template === undefined) {
    throw new Error(format(catalog['strings.missing_key'], { key }, key));
  }
  return format(template, params, key);
}

/**
 * 波括弧で囲んだ差し込み位置を置換します。
 * @param {string} template
 * @param {Record<string, string | number>} params
 * @param {string} key 例外メッセージに用いる文言キー
 * @returns {string}
 */
function format(template, params, key) {
  return template.replace(/\{(\w+)\}/g, (_match, name) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`missing parameter "${name}" for message key "${key}"`);
    }
    return String(value);
  });
}

/** テストから状態を初期化するために用います。 */
function resetCache() {
  cache = null;
}

module.exports = { t, resetCache, CATALOG_PATH };
