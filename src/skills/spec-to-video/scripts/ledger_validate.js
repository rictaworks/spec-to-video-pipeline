'use strict';

/**
 * 工程 P3・P5・P6・P7・P11 の入口ゲートです。
 * 台帳の必須項目と、requirements.md 12.1 の機械検査を実行します。
 * 不足がある場合はフォールバックせず、検出内容を列挙して停止します。
 */

const fs = require('node:fs');
const path = require('node:path');
const { t } = require('./lib/strings.js');

const VALIDATION_PATH = path.join(__dirname, '..', 'config', 'validation.json');

/** @typedef {{code: string, message: string}} Finding */

/**
 * 検査の設定値を読み込みます。
 * @returns {Record<string, any>}
 */
function loadRules() {
  return JSON.parse(fs.readFileSync(VALIDATION_PATH, 'utf8'));
}

/**
 * 台帳の必須項目を検査します。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>} clips
 * @returns {Finding[]}
 */
function validateRequired(transcript, clips) {
  /** @type {Finding[]} */
  const findings = [];
  if (!Array.isArray(transcript.scenes)) {
    findings.push({ code: 'transcript.scenes', message: t('validate.schema_error', { details: 'scenes' }) });
    return findings;
  }
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    ['scene_id', 'subtitle_lines', 'narration_text', 'figure_text'].forEach((field) => {
      if (scene[field] === undefined) {
        findings.push({
          code: `transcript.${field}`,
          message: t('validate.schema_error', { details: `${String(scene.scene_id)}.${field}` }),
        });
      }
    });
  });
  if (!Array.isArray(clips.materials)) {
    findings.push({ code: 'clips.materials', message: t('validate.schema_error', { details: 'materials' }) });
    return findings;
  }
  clips.materials.forEach((/** @type {Record<string, any>} */ material) => {
    ['material_id', 'scene_id', 'order', 'kind', 'adopted', 'generation_count'].forEach((field) => {
      if (material[field] === undefined) {
        findings.push({
          code: `clips.${field}`,
          message: t('validate.schema_error', { details: `${String(material.material_id)}.${field}` }),
        });
      }
    });
  });
  return findings;
}

/**
 * 字幕の可読を検査します。表示時間は、1つの字幕としてまとめて表示される時間で判定します。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>} rules
 * @returns {Finding[]}
 */
function validateSubtitles(transcript, rules) {
  /** @type {Finding[]} */
  const findings = [];
  const limit = rules.subtitle;
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const lines = scene.subtitle_lines || [];
    if (lines.length > limit.max_lines) {
      findings.push({
        code: 'subtitle.lines',
        message: t('validate.subtitle_too_many_lines', { scene_id: scene.scene_id, max: limit.max_lines }),
      });
    }
    lines.forEach((/** @type {Record<string, any>} */ line) => {
      const count = line.char_count !== undefined ? line.char_count : String(line.text).length;
      if (count > limit.max_chars_per_line) {
        findings.push({
          code: 'subtitle.chars',
          message: t('validate.subtitle_too_long', {
            scene_id: scene.scene_id,
            max: limit.max_chars_per_line,
            text: line.text,
          }),
        });
      }
    });
    if (
      scene.measured_narration_sec !== undefined &&
      lines.length > 0 &&
      scene.measured_narration_sec < limit.min_display_sec
    ) {
      findings.push({
        code: 'subtitle.display',
        message: t('validate.subtitle_too_short_display', {
          scene_id: scene.scene_id,
          min: limit.min_display_sec,
        }),
      });
    }
  });
  return findings;
}

/**
 * 字幕が単体で状況を示しているかを検査します。指示語・接続詞で始まる字幕は、
 * 前のシーンを見ていないと意味が取れないものとして検出します。
 * 判断しきれない範囲は人間審査に委ねます。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>} rules
 * @returns {Finding[]}
 */
function validateContextFree(transcript, rules) {
  /** @type {Finding[]} */
  const findings = [];
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const lines = scene.subtitle_lines || [];
    if (lines.length === 0) return;
    const head = String(lines[0].text).trim();
    const matched = rules.dependent_prefixes.some((/** @type {string} */ prefix) => head.startsWith(prefix));
    if (matched) {
      findings.push({
        code: 'subtitle.context',
        message: t('validate.not_context_free', { scene_id: scene.scene_id }),
      });
    }
  });
  return findings;
}

/**
 * 尺整合を検査します。実尺がシーン尺を超える場合のみ不適合とします。
 * 設計書側に対応するシーンが無い場合も検出します。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>[]} scenesSpec
 * @returns {Finding[]}
 */
function validateDuration(transcript, scenesSpec) {
  /** @type {Finding[]} */
  const findings = [];
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const spec = scenesSpec.find(
      (/** @type {Record<string, any>} */ item) => item.scene_id === scene.scene_id,
    );
    if (spec === undefined) {
      findings.push({
        code: 'duration.scene_not_in_spec',
        message: t('validate.scene_not_in_spec', { scene_id: scene.scene_id }),
      });
      return;
    }
    if (scene.measured_narration_sec === undefined) return;
    if (scene.measured_narration_sec > spec.duration_sec) {
      findings.push({
        code: 'duration.over',
        message: t('validate.narration_over_scene', {
          scene_id: scene.scene_id,
          measured: scene.measured_narration_sec,
          duration: spec.duration_sec,
        }),
      });
    }
  });
  return findings;
}

/**
 * カット数の一致を検査します。
 * @param {Record<string, any>} clips
 * @param {Record<string, any>[]} scenesSpec
 * @returns {Finding[]}
 */
function validateCutCount(clips, scenesSpec) {
  /** @type {Finding[]} */
  const findings = [];
  scenesSpec.forEach((/** @type {Record<string, any>} */ spec) => {
    const actual = clips.materials.filter(
      (/** @type {Record<string, any>} */ material) =>
        material.scene_id === spec.scene_id && material.kind !== 'still_seed',
    ).length;
    if (actual !== spec.material_count) {
      findings.push({
        code: 'cut.count',
        message: t('validate.cut_count_mismatch', {
          scene_id: spec.scene_id,
          expected: spec.material_count,
          actual,
        }),
      });
    }
  });
  return findings;
}

/**
 * 文言の確定と用語の平易性を検査します。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>} rules
 * @returns {Finding[]}
 */
function validateWording(transcript, rules) {
  /** @type {Finding[]} */
  const findings = [];
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const figures = scene.figure_text || [];
    if (figures.length > 0 && scene.proofread_at === undefined) {
      findings.push({
        code: 'wording.proofread',
        message: t('validate.figure_text_not_proofread', { scene_id: scene.scene_id }),
      });
    }
    const haystack = [
      scene.narration_text || '',
      ...(scene.subtitle_lines || []).map((/** @type {Record<string, any>} */ line) => line.text),
      ...figures,
    ].join(' ');
    rules.excluded_terms.forEach((/** @type {string} */ term) => {
      if (haystack.includes(term)) {
        findings.push({
          code: 'wording.term',
          message: t('validate.excluded_term', { scene_id: scene.scene_id, term }),
        });
      }
    });
  });
  return findings;
}

/**
 * すべての検査を実行します。設計書のシーン情報が渡されない場合、
 * 検査を飛ばして通過させず停止します。
 * @param {{transcript: Record<string, any>, clips: Record<string, any>, scenesSpec?: Record<string, any>[]}} input
 * @returns {Finding[]}
 */
function validateAll(input) {
  const rules = loadRules();
  if (!Array.isArray(input.scenesSpec)) {
    throw new Error(t('validate.scenes_spec_missing'));
  }
  const scenesSpec = input.scenesSpec;
  const required = validateRequired(input.transcript, input.clips);
  if (required.length > 0) return required;
  return [
    ...validateSubtitles(input.transcript, rules),
    ...validateContextFree(input.transcript, rules),
    ...validateDuration(input.transcript, scenesSpec),
    ...validateCutCount(input.clips, scenesSpec),
    ...validateWording(input.transcript, rules),
  ];
}

module.exports = {
  loadRules,
  validateRequired,
  validateSubtitles,
  validateContextFree,
  validateDuration,
  validateCutCount,
  validateWording,
  validateAll,
};
