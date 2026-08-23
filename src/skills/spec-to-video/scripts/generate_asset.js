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
 * @typedef {{generate: (request: {operation: string, prompt: string, model: string}) => {file_path: string, duration_sec: number}}} Generator
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
 * 素材を生成します。承認・上限・冪等性をここで判定します。
 * @param {{materials: Material[], costLog: CostEntry[], costPolicy: {retry_limit: number, hard_cap: number}, unitPrice: number, approved: boolean, generator?: Generator, environment?: NodeJS.ProcessEnv}} input
 * @returns {{materials: Material[], costLog: CostEntry[], stopped_by: string | null, held: string[]}}
 */
function generateAssets(input) {
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
  /** @type {string | null} */
  let stoppedBy = null;

  for (const material of materials) {
    if (material.adopted === true) {
      continue;
    }
    const nextCost = estimateCost({ unit_price: input.unitPrice, quantity: 1, retake_factor: 1 });
    // 次の生成を実行すると上限を超える場合、実行せずに停止します。
    if (totalCost(costLog) + nextCost > input.costPolicy.hard_cap) {
      stoppedBy = 'hard_cap';
      break;
    }
    if (material.generation_count >= input.costPolicy.retry_limit) {
      held.push(material.material_id);
      continue;
    }
    const result = generator.generate({
      operation: material.kind,
      prompt: String(material.prompt || ''),
      model: String(material.model_name || ''),
    });
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

  if (stoppedBy === null && held.length > 0) {
    stoppedBy = 'retry_limit';
  }
  return { materials, costLog, stopped_by: stoppedBy, held };
}

module.exports = { generateAssets, estimateCost, totalCost };
