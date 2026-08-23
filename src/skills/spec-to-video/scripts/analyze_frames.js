'use strict';

/**
 * 工程 P13: 最終 mp4 に対する機械検証を行います。
 * 検出結果と該当区間を返します。合否の確定は人間審査と併せて行います。
 */

const fs = require('node:fs');
const path = require('node:path');
const { t } = require('./lib/strings.js');

const THRESHOLD_PATH = path.join(__dirname, '..', 'config', 'frame-analysis.json');

/**
 * @typedef {{index: number, time_sec: number, luminance: number, red_ratio: number, pattern_ratio: number}} Frame
 * @typedef {{start_sec: number, end_sec: number}} Range
 */

/**
 * 閾値を読み込みます。
 * @returns {Record<string, any>}
 */
function loadThresholds() {
  return JSON.parse(fs.readFileSync(THRESHOLD_PATH, 'utf8'));
}

/**
 * 1秒あたりの点滅回数を数え、上限を超える区間を返します。
 * @param {Frame[]} frames
 * @param {number} delta 点滅とみなす輝度差
 * @param {number} maxPerSecond 1秒あたりの上限
 * @param {(frame: Frame) => number} pick 判定に用いる値
 * @returns {Range[]}
 */
function detectFlashes(frames, delta, maxPerSecond, pick) {
  /** @type {Range[]} */
  const ranges = [];
  /** @type {number[]} */
  const flashTimes = [];
  for (let i = 1; i < frames.length; i += 1) {
    if (Math.abs(pick(frames[i]) - pick(frames[i - 1])) >= delta) {
      flashTimes.push(frames[i].time_sec);
    }
  }
  for (let i = 0; i < flashTimes.length; i += 1) {
    const windowEnd = flashTimes[i] + 1;
    const count = flashTimes.filter((time) => time >= flashTimes[i] && time < windowEnd).length;
    if (count > maxPerSecond) {
      ranges.push({ start_sec: flashTimes[i], end_sec: windowEnd });
    }
  }
  return mergeRanges(ranges);
}

/**
 * 重なる区間をまとめます。
 * @param {Range[]} ranges
 * @returns {Range[]}
 */
function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a.start_sec - b.start_sec);
  /** @type {Range[]} */
  const merged = [];
  sorted.forEach((range) => {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start_sec <= last.end_sec) {
      last.end_sec = Math.max(last.end_sec, range.end_sec);
      return;
    }
    merged.push({ start_sec: range.start_sec, end_sec: range.end_sec });
  });
  return merged;
}

/**
 * 規則的パターンが画面の大部分を占める区間を返します。
 * @param {Frame[]} frames
 * @param {number} ratioLimit
 * @returns {Range[]}
 */
function detectPatterns(frames, ratioLimit) {
  return mergeRanges(
    frames
      .filter((frame) => frame.pattern_ratio >= ratioLimit)
      .map((frame) => ({ start_sec: frame.time_sec, end_sec: frame.time_sec })),
  );
}

/**
 * 宣言された区間に含まれるかを判定します。
 * @param {number} time
 * @param {Range[]} declared
 * @returns {boolean}
 */
function isDeclared(time, declared) {
  return declared.some((range) => time >= range.start_sec && time <= range.end_sec);
}

/**
 * 前後と不連続な短時間フレームを抽出します。宣言区間は除外します。
 * @param {Frame[]} frames
 * @param {number} delta
 * @param {Range[]} declaredRanges
 * @returns {Range[]}
 */
function detectDiscontinuities(frames, delta, declaredRanges) {
  /** @type {Range[]} */
  const ranges = [];
  for (let i = 1; i < frames.length - 1; i += 1) {
    const prev = frames[i - 1].luminance;
    const current = frames[i].luminance;
    const next = frames[i + 1].luminance;
    const isolated = Math.abs(current - prev) >= delta && Math.abs(current - next) >= delta;
    if (isolated && !isDeclared(frames[i].time_sec, declaredRanges)) {
      ranges.push({ start_sec: frames[i].time_sec, end_sec: frames[i].time_sec });
    }
  }
  return mergeRanges(ranges);
}

/**
 * 出力規格を照合します。
 * @param {Record<string, any>} actual
 * @param {Record<string, any>} expected
 * @returns {string[]}
 */
function compareOutputSpec(actual, expected) {
  return ['resolution', 'fps', 'codec', 'audio'].filter(
    (field) => String(actual[field]) !== String(expected[field]),
  );
}

/**
 * 機械検証を実行します。
 * @param {{frames: Frame[], outputSpec: Record<string, any>, actualSpec: Record<string, any>, declaredRanges?: Range[]}} input
 * @returns {Record<string, any>}
 */
function analyzeFrames(input) {
  const thresholds = loadThresholds();
  const declared = input.declaredRanges || [];
  if (input.frames.length === 0) {
    throw new Error(t('analyze.no_frames'));
  }
  const luminanceFlashes = detectFlashes(
    input.frames,
    thresholds.luminance_delta,
    thresholds.max_flashes_per_second,
    (frame) => frame.luminance,
  );
  const redFlashes = detectFlashes(
    input.frames,
    thresholds.red_delta,
    thresholds.max_red_flashes_per_second,
    (frame) => frame.red_ratio,
  );
  const patterns = detectPatterns(input.frames, thresholds.pattern_ratio_limit);
  const discontinuities = detectDiscontinuities(input.frames, thresholds.discontinuity_delta, declared);
  const specMismatch = compareOutputSpec(input.actualSpec, input.outputSpec);

  return {
    photosensitivity: { luminance: luminanceFlashes, red: redFlashes },
    patterns,
    discontinuities,
    excluded_ranges: declared,
    output_spec_mismatch: specMismatch,
    passed:
      luminanceFlashes.length === 0 &&
      redFlashes.length === 0 &&
      discontinuities.length === 0 &&
      specMismatch.length === 0,
  };
}

module.exports = {
  analyzeFrames,
  detectFlashes,
  detectPatterns,
  detectDiscontinuities,
  compareOutputSpec,
  mergeRanges,
  loadThresholds,
};
