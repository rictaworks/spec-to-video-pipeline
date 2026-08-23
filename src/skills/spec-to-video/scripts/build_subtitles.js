'use strict';

/**
 * 工程 P6: 台本台帳から字幕ファイル（SRT）を生成します。
 * 可読規約に反する場合、改行位置や文言を自動で変えず、生成せずに停止します。
 */

const fs = require('node:fs');
const path = require('node:path');
const { t } = require('./lib/strings.js');

const VALIDATION_PATH = path.join(__dirname, '..', 'config', 'validation.json');

/**
 * 秒を SRT の時刻表記へ変換します。
 * @param {number} seconds
 * @returns {string}
 */
function formatTimestamp(seconds) {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);
  const pad = (/** @type {number} */ value, /** @type {number} */ width) => String(value).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(millis, 3)}`;
}

/**
 * 可読規約を検査します。違反があれば例外を投げます。
 * @param {Record<string, any>} scene
 * @param {Record<string, any>} rules
 * @param {number} displaySec
 */
function assertReadable(scene, rules, displaySec) {
  const limit = rules.subtitle;
  const lines = scene.subtitle_lines || [];
  if (lines.length > limit.max_lines) {
    throw new Error(t('validate.subtitle_too_many_lines', { scene_id: String(scene.scene_id), max: limit.max_lines }));
  }
  lines.forEach((/** @type {Record<string, any>} */ line) => {
    const count = line.char_count !== undefined ? line.char_count : String(line.text).length;
    if (count > limit.max_chars_per_line) {
      throw new Error(
        t('validate.subtitle_too_long', {
          scene_id: String(scene.scene_id),
          max: limit.max_chars_per_line,
          text: String(line.text),
        }),
      );
    }
  });
  if (displaySec < limit.min_display_sec) {
    throw new Error(
      t('validate.subtitle_too_short_display', { scene_id: String(scene.scene_id), min: limit.min_display_sec }),
    );
  }
}

/**
 * 台本台帳から SRT を組み立てます。
 * @param {Record<string, any>} transcript
 * @returns {string}
 */
function buildSubtitles(transcript) {
  const rules = JSON.parse(fs.readFileSync(VALIDATION_PATH, 'utf8'));
  /** @type {string[]} */
  const blocks = [];
  let index = 0;
  let cursor = 0;
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const duration = scene.measured_narration_sec;
    if (duration === undefined) {
      throw new Error(t('subtitles.duration_missing', { scene_id: String(scene.scene_id) }));
    }
    assertReadable(scene, rules, duration);
    index += 1;
    const start = cursor;
    const end = cursor + duration;
    const text = (scene.subtitle_lines || []).map((/** @type {Record<string, any>} */ line) => String(line.text)).join('\n');
    blocks.push(`${index}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${text}\n`);
    cursor = end;
  });
  return blocks.join('\n');
}

module.exports = { buildSubtitles, formatTimestamp };
