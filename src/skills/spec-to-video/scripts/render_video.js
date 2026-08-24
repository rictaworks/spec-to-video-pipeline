'use strict';

/**
 * 工程 P12: レンダリングを実行し、レンダ回数を課金ログへ計上します。
 * 採用済みの素材のみを用い、生成呼び出しを行いません。
 */

const { t } = require('./lib/strings.js');
const { assertNormalized } = require('./normalize_materials.js');

const OUTPUT_REQUIRED = ['resolution', 'fps', 'codec', 'audio'];

/**
 * @typedef {{render: (input: {outputPath: string, spec: Record<string, any>, materials: Record<string, any>[]}) => {file_path: string} | Promise<{file_path: string}>}} Renderer
 */

/**
 * 出力規格の充足を確認します。既定値で補完しません。
 * @param {Record<string, any>} spec
 */
function assertOutputSpec(spec) {
  const missing = OUTPUT_REQUIRED.filter((field) => spec === undefined || spec[field] === undefined || spec[field] === '');
  if (missing.length > 0) {
    throw new Error(t('render.spec_missing', { fields: missing.join(', ') }));
  }
}

/**
 * レンダリングを実行します。レンダラーが Promise を返す場合は完了を待ちます。
 * @param {{outputSpec: Record<string, any>, materials: Record<string, any>[], costLog: Record<string, any>[], renderCount: number, outputPath: string, renderer: Renderer}} input
 * @returns {Promise<{file_path: string, render_count: number}>}
 */
async function renderVideo(input) {
  assertOutputSpec(input.outputSpec);
  const adopted = input.materials.filter((material) => material.adopted === true);
  if (adopted.length === 0) {
    throw new Error(t('render.no_adopted_material'));
  }
  const unresolved = adopted.filter((material) => material.file_path === undefined);
  if (unresolved.length > 0) {
    throw new Error(t('render.material_file_missing', { ids: unresolved.map((m) => m.material_id).join(', ') }));
  }
  // そろえていない素材を合成へ渡すと、素材は壊れていないのに読めず、
  // 作り直しという誤った対処へ進みます。ここで止めます。
  assertNormalized(adopted);
  // レンダラーは Promise を返すことがあります（Remotion の renderMedia など）。
  // 完了を待たずに戻ると、書き出し前に工程が終わったように見えます。
  const result = await input.renderer.render({
    outputPath: input.outputPath,
    spec: input.outputSpec,
    materials: adopted,
  });
  if (result === null || result === undefined || typeof result.file_path !== 'string') {
    throw new Error(t('render.result_invalid'));
  }
  return { file_path: result.file_path, render_count: input.renderCount + 1 };
}

module.exports = { renderVideo, assertOutputSpec };
