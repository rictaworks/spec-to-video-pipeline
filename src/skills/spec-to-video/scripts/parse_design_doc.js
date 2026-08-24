'use strict';

/**
 * 工程 P1: 動画設計書から読み取った正規化構造を検査し、尺を秒へ揃えます。
 *
 * 設計書の体裁は案件ごとに異なります。読み取りそのものはエージェントの判断で行い、
 * このスクリプトは受け取った構造の必須項目・型・単位を検査します。
 * 欠損は推測で補完せず、どのシーンのどの項目かを列挙して停止します。
 */

const { t } = require('./lib/strings.js');
const fs = require('node:fs');
const path = require('node:path');

const PARSING_PATH = path.join(__dirname, '..', 'config', 'parsing.json');

/**
 * 尺の単位として受け付ける表記を読み込みます。
 * @returns {{frame_suffixes: string[], second_suffixes: string[]}}
 */
function loadDurationUnits() {
  return JSON.parse(fs.readFileSync(PARSING_PATH, 'utf8')).duration_units;
}

const SCENE_REQUIRED = [
  'scene_id',
  'duration_sec',
  'cuts',
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

const MATERIAL_KINDS = ['clip', 'figure', 'title_card'];
const PRODUCTION_MODES = ['generative', 'remotion_only'];

/**
 * 尺の表記を秒へ揃えます。秒・フレーム数・分:秒のいずれも受け付けます。
 * 判断が付かない表記は補完せず null を返します。
 * @param {string | number} raw
 * @param {number} fps
 * @returns {{seconds: number, unit: string} | null}
 */
function toSeconds(raw, fps) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { seconds: raw, unit: 'second' };
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.normalize('NFKC').trim();

  const timecode = value.match(new RegExp('^(?:([0-9]+):)?([0-9]{1,2}):([0-9]{1,2})(?:[.]([0-9]+))?$'));
  if (timecode !== null) {
    const hours = timecode[1] === undefined ? 0 : Number(timecode[1]);
    const minutes = Number(timecode[2]);
    const seconds = Number(timecode[3]);
    const fraction = timecode[4] === undefined ? 0 : Number('0.' + timecode[4]);
    return { seconds: hours * 3600 + minutes * 60 + seconds + fraction, unit: 'timecode' };
  }

  const units = loadDurationUnits();
  const frames = value
    .replace(/,/g, '')
    .match(new RegExp('^([0-9]+(?:[.][0-9]+)?)[ 　]*(?:' + units.frame_suffixes.join('|') + ')$'));
  if (frames !== null) {
    if (!Number.isFinite(fps) || fps <= 0) {
      return null;
    }
    return { seconds: Number(frames[1]) / fps, unit: 'frame' };
  }

  const seconds = value
    .replace(/,/g, '')
    .match(new RegExp('^[^0-9.]*([0-9]+(?:[.][0-9]+)?)[ 　]*(?:' + units.second_suffixes.join('|') + ')?$'));
  if (seconds !== null) {
    return { seconds: Number(seconds[1]), unit: 'second' };
  }
  return null;
}

/**
 * フレームレートを取り出します。
 * @param {Record<string, any>} outputSpec
 * @returns {number | null}
 */
function resolveFps(outputSpec) {
  if (outputSpec === undefined || outputSpec === null) {
    return null;
  }
  const raw = String(outputSpec.fps === undefined ? '' : outputSpec.fps).normalize('NFKC');
  const matched = raw.match(new RegExp('([0-9]+(?:[.][0-9]+)?)'));
  if (matched === null) {
    return null;
  }
  const value = Number(matched[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * エージェントが読み取った構造を検査し、尺を秒へ揃えて返します。
 * @param {Record<string, any>} extracted
 * @returns {Record<string, any>}
 */
function normalizeDesignDoc(extracted) {
  if (extracted === null || typeof extracted !== 'object') {
    throw new TypeError('extracted must be an object');
  }
  /** @type {string[]} */
  const missing = [];

  /**
   * @param {Record<string, any> | undefined} source
   * @param {string[]} fields
   * @param {string} label
   * @returns {Record<string, any>}
   */
  const pick = (source, fields, label) => {
    /** @type {Record<string, any>} */
    const picked = {};
    fields.forEach((field) => {
      const value = source === undefined || source === null ? undefined : source[field];
      if (value === undefined || String(value).trim() === '') {
        missing.push(label + '.' + field);
        return;
      }
      picked[field] = value;
    });
    return picked;
  };

  const meta = pick(extracted.meta, META_REQUIRED, 'meta');
  const outputSpec = pick(extracted.output_spec, OUTPUT_REQUIRED, 'output_spec');
  const costPolicy = pick(extracted.cost_policy, COST_REQUIRED, 'cost_policy');

  ['retry_limit', 'hard_cap'].forEach((field) => {
    if (costPolicy[field] === undefined) return;
    const value = Number(costPolicy[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(t('parse.cost_policy_not_numeric', { field, value: String(costPolicy[field]) }));
    }
    costPolicy[field] = value;
  });
  const narration = pick(extracted.narration, NARRATION_REQUIRED, 'narration');

  if (meta.production_mode !== undefined && !PRODUCTION_MODES.includes(String(meta.production_mode))) {
    throw new Error(t('parse.unknown_production_mode', { value: String(meta.production_mode) }));
  }

  const fps = resolveFps(extracted.output_spec);
  const scenes = Array.isArray(extracted.scenes) ? extracted.scenes : [];
  if (scenes.length === 0) {
    throw new Error(t('parse.no_scenes'));
  }

  const normalizedScenes = scenes.map((/** @type {Record<string, any>} */ scene) => {
    const id = scene === null || scene === undefined ? '?' : String(scene.scene_id);
    /** @type {Record<string, any>} */
    const normalized = Object.assign({}, scene);

    SCENE_REQUIRED.forEach((field) => {
      const value = scene === null || scene === undefined ? undefined : scene[field];
      if (field === 'intentional_luminance_change') {
        if (typeof value !== 'boolean') {
          missing.push(id + '.' + field);
        }
        return;
      }
      if (field === 'cuts') {
        if (!Array.isArray(value) || value.length === 0) {
          missing.push(id + '.' + field);
        }
        return;
      }
      if (field === 'subtitles') {
        if (!Array.isArray(value) || value.length === 0) {
          missing.push(id + '.' + field);
        }
        return;
      }
      if (value === undefined || String(value).trim() === '') {
        missing.push(id + '.' + field);
      }
    });

    if (scene !== null && scene !== undefined && scene.duration_sec !== undefined) {
      const converted = toSeconds(scene.duration_sec, fps === null ? Number.NaN : fps);
      if (converted === null) {
        missing.push(id + '.duration_sec');
      } else {
        normalized.duration_sec = Number(converted.seconds.toFixed(3));
        normalized.duration_source_unit = converted.unit;
      }
    }
    const cuts = scene === null || scene === undefined ? undefined : scene.cuts;
    if (Array.isArray(cuts)) {
      cuts.forEach((/** @type {Record<string, any>} */ cut, index) => {
        if (cut.cut_id === undefined || String(cut.cut_id).trim() === '') {
          missing.push(id + '.cuts[' + index + '].cut_id');
        }
        if (!MATERIAL_KINDS.includes(String(cut.material_kind))) {
          throw new Error(t('parse.unknown_material_kind', { scene_id: id, value: String(cut.material_kind) }));
        }
        if (cut.duration_sec !== undefined) {
          const cutDuration = toSeconds(cut.duration_sec, fps === null ? Number.NaN : fps);
          if (cutDuration === null) {
            missing.push(id + '.cuts[' + index + '].duration_sec');
          } else {
            cut.duration_sec = Number(cutDuration.seconds.toFixed(3));
          }
        }
      });
      if (scene.material_count !== undefined && Number(scene.material_count) !== cuts.length) {
        throw new Error(t('parse.cut_count_mismatch', {
          scene_id: id,
          declared: String(scene.material_count),
          actual: String(cuts.length),
        }));
      }
    }

    if (scene !== null && scene !== undefined && scene.material_count !== undefined) {
      const count = Number(scene.material_count);
      if (!Number.isInteger(count) || count < 1) {
        missing.push(id + '.material_count');
      } else {
        normalized.material_count = count;
      }
    }
    return normalized;
  });

  if (missing.length > 0) {
    throw new Error(t('parse.missing_fields', { fields: Array.from(new Set(missing)).join(', ') }));
  }

  return {
    meta,
    scenes: normalizedScenes,
    output_spec: outputSpec,
    cost_policy: costPolicy,
    narration,
    constraints: extracted.constraints === undefined ? [] : extracted.constraints,
    fps_used_for_conversion: fps,
  };
}

module.exports = { normalizeDesignDoc, toSeconds, resolveFps, loadDurationUnits, SCENE_REQUIRED, MATERIAL_KINDS };
