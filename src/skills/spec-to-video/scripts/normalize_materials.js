'use strict';

/**
 * 工程 P11 の前段: 採用した素材を合成規格へそろえます。
 *
 * 生成した素材は、そのままでは合成に用いられません。生成側の都合（フレームレート・
 * 音声の有無・符号化の仕方）が合成側の要求と一致しないためです。そろえずに渡すと、
 * 素材そのものは壊れていないのに合成側で読めず、素材の作り直しという誤った対処へ
 * 進みます。作り直しは課金を伴い、しかも原因ではありません。
 */

const fs = require('node:fs');
const path = require('node:path');
const { t } = require('./lib/strings.js');
const { isDevelopment } = require('./lib/env.js');

const VALIDATION_PATH = path.join(__dirname, '..', 'config', 'validation.json');

/**
 * @typedef {{material_id: string, kind: string, adopted: boolean, file_path?: string, normalized?: boolean, source_file_path?: string}} Material
 * @typedef {{normalize: (request: {materialId: string, sourcePath: string, spec: Record<string, any>}) => ({file_path: string, source_file_path: string} | Promise<{file_path: string, source_file_path: string}>)}} Normalizer
 */

/**
 * そろえる条件を設定から読みます。既定値で補完しません。
 * @returns {Record<string, any>}
 */
function normalizationRules() {
  const rules = JSON.parse(fs.readFileSync(VALIDATION_PATH, 'utf8')).normalization;
  if (rules === undefined) {
    throw new Error(t('normalize.rules_missing'));
  }
  return rules;
}

/**
 * その素材が「そろえる」対象かどうかを返します。
 * 動く素材だけが対象です。静止画は合成側がそのまま扱えます。
 * @param {Material} material
 * @returns {boolean}
 */
function requiresNormalization(material) {
  return normalizationRules().target_kinds.includes(String(material.kind));
}

/**
 * そろえる先の仕様を組み立てます。フレームレートは出力規格から取ります。
 * @param {Record<string, any>} outputSpec
 * @returns {Record<string, any>}
 */
function buildSpec(outputSpec) {
  const rules = normalizationRules();
  if (outputSpec === undefined || outputSpec.fps === undefined || String(outputSpec.fps).trim() === '') {
    throw new Error(t('normalize.fps_missing'));
  }
  const fps = Number(String(outputSpec.fps).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(t('normalize.fps_missing'));
  }
  return {
    fps,
    constant_frame_rate: rules.constant_frame_rate,
    all_keyframes: rules.all_keyframes,
    silent_audio_track: rules.silent_audio_track,
    index_at_head: rules.index_at_head,
    keep_source: rules.keep_source,
  };
}

/**
 * 開発環境で用いるスタブです。外部の変換を行いません。
 * @returns {Normalizer}
 */
function stubNormalizer() {
  return {
    normalize(request) {
      return {
        file_path: request.sourcePath,
        source_file_path: `${request.sourcePath}.source`,
      };
    },
  };
}

/**
 * 採用した素材を合成規格へそろえます。
 * @param {{materials: Material[], outputSpec: Record<string, any>, normalizer?: Normalizer, environment?: NodeJS.ProcessEnv}} input
 * @returns {Promise<{materials: Material[], normalized: string[], skipped: string[]}>}
 */
async function normalizeMaterials(input) {
  const normalizer = isDevelopment(input.environment) ? stubNormalizer() : input.normalizer;
  if (normalizer === undefined) {
    throw new Error(t('normalize.no_normalizer'));
  }
  const spec = buildSpec(input.outputSpec);
  const materials = JSON.parse(JSON.stringify(input.materials));

  /** @type {string[]} */
  const normalized = [];
  /** @type {string[]} */
  const skipped = [];

  for (const material of materials) {
    if (material.adopted !== true) {
      continue;
    }
    if (!requiresNormalization(material)) {
      skipped.push(material.material_id);
      continue;
    }
    if (material.normalized === true) {
      // 済んだものはやり直しません。
      continue;
    }
    if (typeof material.file_path !== 'string' || material.file_path === '') {
      throw new Error(t('normalize.file_missing', { material_id: material.material_id }));
    }
    // 変換器は Promise を返すことがあります。完了を待たずに戻ると、そろっていない
    // 素材を合成へ渡します。
    const result = await normalizer.normalize({
      materialId: material.material_id,
      sourcePath: material.file_path,
      spec,
    });
    if (
      result === null
      || result === undefined
      || typeof result.file_path !== 'string'
      || typeof result.source_file_path !== 'string'
    ) {
      throw new Error(t('normalize.result_invalid', { material_id: material.material_id }));
    }
    material.source_file_path = result.source_file_path;
    material.file_path = result.file_path;
    material.normalized = true;
    normalized.push(material.material_id);
  }

  return { materials, normalized, skipped };
}

/**
 * そろえていない素材が残っていないことを確かめます。
 * @param {Material[]} materials
 */
function assertNormalized(materials) {
  const pending = materials
    .filter((material) => material.adopted === true)
    .filter((material) => requiresNormalization(material))
    .filter((material) => material.normalized !== true)
    .map((material) => material.material_id);
  if (pending.length > 0) {
    throw new Error(t('normalize.not_normalized', { ids: pending.join(', ') }));
  }
}

module.exports = {
  normalizeMaterials,
  assertNormalized,
  requiresNormalization,
  buildSpec,
  normalizationRules,
};
