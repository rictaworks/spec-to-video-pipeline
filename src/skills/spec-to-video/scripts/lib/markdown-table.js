'use strict';

/** Markdown の表を抽出します。表以外の記法は解釈しません。 */

/**
 * @typedef {{headers: string[], rows: string[][]}} Table
 */

/**
 * 行を縦棒で分割します。
 * @param {string} line
 * @returns {string[]}
 */
function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * 区切り行かどうかを判定します。
 * @param {string} line
 * @returns {boolean}
 */
function isSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/**
 * Markdown から表をすべて抽出します。
 * @param {string} markdown
 * @returns {Table[]}
 */
function extractTables(markdown) {
  /** @type {Table[]} */
  const tables = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    if (!line.includes('|') || next === undefined || !isSeparator(next)) {
      continue;
    }
    const headers = splitRow(line);
    /** @type {string[][]} */
    const rows = [];
    let cursor = i + 2;
    while (cursor < lines.length && lines[cursor].includes('|')) {
      rows.push(splitRow(lines[cursor]));
      cursor += 1;
    }
    tables.push({ headers, rows });
    i = cursor - 1;
  }
  return tables;
}

module.exports = { extractTables, splitRow, isSeparator };
