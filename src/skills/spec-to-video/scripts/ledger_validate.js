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
 * トランジションの選定を検査します。選定が無いまま合成へ進めないようにします。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>} rules
 * @returns {Finding[]}
 */
function validateTransitions(transcript, rules) {
  /** @type {Finding[]} */
  const findings = [];
  const limit = rules.transition;
  /** @type {Set<string>} */
  const usedKinds = new Set();

  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const cuts = scene.cuts || [];
    const transitions = scene.transitions || [];
    cuts.forEach((/** @type {Record<string, any>} */ cut) => {
      const selected = transitions.find(
        (/** @type {Record<string, any>} */ item) => item.at_cut_id === cut.cut_id,
      );
      if (selected === undefined) {
        findings.push({
          code: 'transition.missing',
          message: t('validate.transition_missing', { scene_id: scene.scene_id, cut_id: cut.cut_id }),
        });
        return;
      }
      if (!limit.kinds.includes(selected.kind)) {
        findings.push({
          code: 'transition.kind',
          message: t('validate.transition_unknown_kind', { scene_id: scene.scene_id, kind: selected.kind }),
        });
      }
      if (selected.reason === undefined || String(selected.reason).trim() === '') {
        findings.push({
          code: 'transition.reason',
          message: t('validate.transition_reason_missing', { scene_id: scene.scene_id, cut_id: cut.cut_id }),
        });
      }
      usedKinds.add(selected.kind);
    });

    // 輝度が急激に変わる遷移が連続していないかを見ます。
    const ordered = cuts
      .map((/** @type {Record<string, any>} */ cut) =>
        transitions.find((/** @type {Record<string, any>} */ item) => item.at_cut_id === cut.cut_id),
      )
      .filter(Boolean);
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1];
      const current = ordered[i];
      if (
        limit.luminance_changing_kinds.includes(previous.kind) &&
        limit.luminance_changing_kinds.includes(current.kind)
      ) {
        findings.push({
          code: 'transition.consecutive_luminance',
          message: t('validate.transition_consecutive_luminance', { scene_id: scene.scene_id }),
        });
        break;
      }
    }
  });

  if (usedKinds.size > limit.max_kinds_per_video) {
    findings.push({
      code: 'transition.kinds_count',
      message: t('validate.transition_too_many_kinds', {
        count: usedKinds.size,
        max: limit.max_kinds_per_video,
      }),
    });
  }
  return findings;
}

/**
 * 演出の選定を検査します。選定が無いまま合成へ進めないようにします。
 * @param {Record<string, any>} transcript
 * @param {Record<string, any>} rules
 * @returns {Finding[]}
 */
function validateDirection(transcript, rules) {
  /** @type {Finding[]} */
  const findings = [];
  const limit = rules.direction;

  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const direction = scene.direction;
    if (direction === undefined) {
      findings.push({
        code: 'direction.missing',
        message: t('validate.direction_missing', { scene_id: scene.scene_id }),
      });
      return;
    }

    /** @type {[string, string[]][]} */
    const enums = [
      ['motion_easing', limit.motion_easing],
      ['blend_mode', limit.blend_modes],
      ['telop_pattern', limit.telop_patterns],
    ];
    enums.forEach(([field, allowed]) => {
      const value = direction[field];
      if (value === undefined || !allowed.includes(value)) {
        findings.push({
          code: 'direction.value',
          message: t('validate.direction_unknown_value', {
            scene_id: scene.scene_id,
            field,
            value: value === undefined ? t('validate.value_unrecorded') : value,
          }),
        });
      }
    });

    if (
      limit.luminance_raising_blend_modes.includes(direction.blend_mode) &&
      (direction.blend_reason === undefined || String(direction.blend_reason).trim() === '')
    ) {
      findings.push({
        code: 'direction.blend_reason',
        message: t('validate.direction_blend_reason_missing', {
          scene_id: scene.scene_id,
          mode: direction.blend_mode,
        }),
      });
    }

    (direction.effects || []).forEach((/** @type {Record<string, any>} */ effect) => {
      if (effect.purpose === undefined || String(effect.purpose).trim() === '') {
        findings.push({
          code: 'direction.effect_purpose',
          message: t('validate.direction_effect_purpose_missing', {
            scene_id: scene.scene_id,
            name: effect.name,
          }),
        });
      }
    });
  });
  return findings;
}

/**
 * 絵コンテから起こしたカットと、設計書側のカットを突き合わせます。
 * 一致しない場合は、どのカットがどう食い違うかを検出として返します。
 * どちらが正かはこちらで決めません。
 * @param {Record<string, any>} transcript 台本台帳
 * @param {Record<string, any>[]} scenesSpec 設計書側のシーン
 * @returns {Finding[]}
 */
function validateStoryboard(transcript, scenesSpec) {
  /** @type {Finding[]} */
  const findings = [];
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const spec = scenesSpec.find(
      (/** @type {Record<string, any>} */ item) => item.scene_id === scene.scene_id,
    );
    if (spec === undefined) return;
    const specCuts = Array.isArray(spec.cuts) ? spec.cuts : [];
    const boardCuts = Array.isArray(scene.cuts) ? scene.cuts : [];
    if (specCuts.length === 0) return;

    if (specCuts.length !== boardCuts.length) {
      findings.push({
        code: 'storyboard.cut_count',
        message: t('validate.storyboard_cut_count', {
          scene_id: scene.scene_id,
          spec: specCuts.length,
          board: boardCuts.length,
        }),
      });
      return;
    }

    specCuts.forEach((/** @type {Record<string, any>} */ specCut, index) => {
      const boardCut = boardCuts[index];
      if (String(specCut.cut_id) !== String(boardCut.cut_id)) {
        findings.push({
          code: 'storyboard.cut_id',
          message: t('validate.storyboard_cut_id', {
            scene_id: scene.scene_id,
            spec: String(specCut.cut_id),
            board: String(boardCut.cut_id),
          }),
        });
        return;
      }
      if (
        specCut.duration_sec !== undefined &&
        boardCut.duration_sec !== undefined &&
        Number(specCut.duration_sec) !== Number(boardCut.duration_sec)
      ) {
        findings.push({
          code: 'storyboard.cut_duration',
          message: t('validate.storyboard_cut_duration', {
            scene_id: scene.scene_id,
            cut_id: String(specCut.cut_id),
            spec: String(specCut.duration_sec),
            board: String(boardCut.duration_sec),
          }),
        });
      }
      if (
        boardCut.material_kind !== undefined &&
        specCut.material_kind !== undefined &&
        String(specCut.material_kind) !== String(boardCut.material_kind)
      ) {
        findings.push({
          code: 'storyboard.cut_kind',
          message: t('validate.storyboard_cut_kind', {
            scene_id: scene.scene_id,
            cut_id: String(specCut.cut_id),
            spec: String(specCut.material_kind),
            board: String(boardCut.material_kind),
          }),
        });
      }
    });
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
    ...validateTransitions(input.transcript, rules),
    ...validateDirection(input.transcript, rules),
    ...validateStoryboard(input.transcript, scenesSpec),
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
  validateTransitions,
  validateDirection,
  validateStoryboard,
  validateDuration,
  validateCutCount,
  validateWording,
  validateAll,
};
