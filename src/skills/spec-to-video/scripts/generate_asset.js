'use strict';

/**
 * 工程 P8〜P10: 生成呼び出しの単一窓口です。
 * リトライ上限・ハードキャップ・課金ログをここで一元的に適用します。
 * 他の経路から生成 API を呼び出しません。
 */

const { t } = require('./lib/strings.js');
const { isDevelopment } = require('./lib/env.js');
const stub = require('./lib/stub/generation.js');

/**
 * @typedef {{material_id: string, scene_id: string, order: number, kind: string, prompt?: string, model_name?: string, generation_count: number, adopted: boolean, file_path?: string, duration_sec?: number, source_still_id?: string}} Material
 * @typedef {{material_id: string, operation: string, model_name: string, generation_count: number, estimated_cost: number}} CostEntry
 * @typedef {{generate: (request: {operation: string, prompt: string, model: string, materialId: string}) => ({file_path: string, duration_sec: number} | Promise<{file_path: string, duration_sec: number}>)}} Generator
 */

/**
 * 見積もり課金額を求めます。
 * @param {{unit_price: number, quantity: number, retake_factor: number}} input
 * @returns {number}
 */
function estimateCost(input) {
  return Number((input.unit_price * input.quantity * input.retake_factor).toFixed(4));
}

/**
 * 課金の合計を求めます。
 * @param {CostEntry[]} entries
 * @returns {number}
 */
function totalCost(entries) {
  return Number(entries.reduce((sum, entry) => sum + entry.estimated_cost, 0).toFixed(4));
}

/**
 * 対象ごとの課金の合計を求めます。
 * @param {CostEntry[]} entries
 * @param {string} kind
 * @returns {number}
 */
function costByKind(entries, kind) {
  return totalCost(entries.filter((entry) => entry.operation === kind));
}

/**
 * 対象ごとの単価を取り出します。対象の指定が無い場合は既定の単価を用います。
 * @param {number | Record<string, number>} unitPrice
 * @param {string} kind
 * @returns {number}
 */
function resolveUnitPrice(unitPrice, kind) {
  if (typeof unitPrice === 'number') {
    return unitPrice;
  }
  const value = unitPrice[kind];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(t('generate.unit_price_missing', { kind }));
  }
  return value;
}

/**
 * 対象ごとの上限を取り出します。上限を設けない対象は Infinity を返します。
 * @param {{hard_cap?: number, hard_cap_by_kind?: Record<string, number | null>}} costPolicy
 * @param {string} kind
 * @returns {number}
 */
function resolveKindCap(costPolicy, kind) {
  const byKind = costPolicy.hard_cap_by_kind;
  if (byKind === undefined || !(kind in byKind)) {
    return Number.POSITIVE_INFINITY;
  }
  const cap = byKind[kind];
  // null は「上限を設けない」を表します。
  return cap === null ? Number.POSITIVE_INFINITY : Number(cap);
}

/**
 * 素材を生成します。承認・上限・冪等性をここで判定します。
 * @param {{materials: Material[], costLog: CostEntry[], costPolicy: {retry_limit: number, hard_cap?: number, hard_cap_by_kind?: Record<string, number | null>}, unitPrice: number | Record<string, number>, approved: boolean, generator?: Generator, environment?: NodeJS.ProcessEnv}} input
 * @returns {Promise<{materials: Material[], costLog: CostEntry[], stopped_by: string | null, held: string[], stopped_kinds: string[], failed: {material_id: string, reason: string}[]}>}
 */
async function generateAssets(input) {
  if (input.approved !== true) {
    throw new Error(t('generate.not_approved'));
  }
  const generator = isDevelopment(input.environment)
    ? { generate: stub.generate }
    : input.generator;
  if (generator === undefined) {
    throw new Error(t('generate.no_generator'));
  }

  const materials = JSON.parse(JSON.stringify(input.materials));
  const costLog = JSON.parse(JSON.stringify(input.costLog));
  /** @type {string[]} */
  const held = [];
  /** @type {{material_id: string, reason: string}[]} */
  const failed = [];
  /** @type {string | null} */
  let stoppedBy = null;

  /** @type {string[]} */
  const stoppedKinds = [];
  const overallCap =
    input.costPolicy.hard_cap === undefined
      ? Number.POSITIVE_INFINITY
      : Number(input.costPolicy.hard_cap);

  for (const material of materials) {
    if (material.adopted === true) {
      continue;
    }
    const kind = String(material.kind);
    const nextCost = estimateCost({
      unit_price: resolveUnitPrice(input.unitPrice, kind),
      quantity: 1,
      retake_factor: 1,
    });

    // 全体の上限を超える場合は、すべての生成を停止します。
    if (totalCost(costLog) + nextCost > overallCap) {
      stoppedBy = 'hard_cap';
      break;
    }
    // 対象ごとの上限を超える場合は、その対象だけを停止し、他の対象は続けます。
    if (costByKind(costLog, kind) + nextCost > resolveKindCap(input.costPolicy, kind)) {
      if (!stoppedKinds.includes(kind)) {
        stoppedKinds.push(kind);
      }
      continue;
    }
    if (material.generation_count >= input.costPolicy.retry_limit) {
      held.push(material.material_id);
      continue;
    }
    // 生成器は Promise を返すことがあります。完了を待たずに戻ると、生成していないのに
    // 採用済みの素材と課金だけが台帳へ積まれます。
    /** @type {{file_path: string, duration_sec: number} | undefined} */
    let result;
    try {
      result = await generator.generate({
        operation: material.kind,
        prompt: String(material.prompt || ''),
        model: String(material.model_name || ''),
        materialId: material.material_id,
      });
    } catch (error) {
      // 失敗しても回数は消費します。他の素材は続けます。
      material.generation_count += 1;
      failed.push({
        material_id: material.material_id,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (result === null || result === undefined || typeof result.file_path !== 'string') {
      throw new Error(t('generate.result_invalid', { material_id: material.material_id }));
    }
    material.generation_count += 1;
    material.file_path = result.file_path;
    material.duration_sec = result.duration_sec;
    costLog.push({
      material_id: material.material_id,
      operation: material.kind,
      model_name: String(material.model_name || ''),
      generation_count: material.generation_count,
      estimated_cost: nextCost,
    });
  }

  if (stoppedBy === null && stoppedKinds.length > 0) {
    stoppedBy = 'hard_cap_by_kind';
  }
  if (stoppedBy === null && held.length > 0) {
    stoppedBy = 'retry_limit';
  }
  if (stoppedBy === null && failed.length > 0) {
    stoppedBy = 'generation_failed';
  }
  return { materials, costLog, stopped_by: stoppedBy, held, stopped_kinds: stoppedKinds, failed };
}

module.exports = {
  generateAssets,
  estimateCost,
  totalCost,
  costByKind,
  resolveUnitPrice,
  resolveKindCap,
};
