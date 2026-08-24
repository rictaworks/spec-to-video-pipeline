'use strict';

/**
 * 開発環境で用いる生成 API のスタブです。
 * 外部への通信を行わず、課金も発生しません。呼び出し内容だけを記録します。
 */

const { createHash } = require('node:crypto');

/** @type {{operation: string, prompt: string, model: string, materialId: string}[]} */
const calls = [];

/**
 * 生成呼び出しを記録し、決定的な結果を返します。
 * @param {{operation: string, prompt: string, model: string, materialId: string}} request
 * @returns {{file_path: string, duration_sec: number, stub: true}}
 */
/**
 * 入力から決まる短い識別子を求めます。実行順に依存しない値にするためです。
 * @param {{operation: string, prompt: string, model: string, materialId: string}} request
 * @returns {string}
 */
function digest(request) {
  return createHash('sha256')
    .update([request.operation, request.prompt, request.model, request.materialId].join('|'))
    .digest('hex')
    .slice(0, 12);
}

/**
 * 生成呼び出しを記録し、入力から決まる結果を返します。
 * @param {{operation: string, prompt: string, model: string, materialId: string}} request
 * @returns {{file_path: string, duration_sec: number, stub: true}}
 */
function generate(request) {
  calls.push(request);
  return {
    file_path: `stub/${request.operation}-${digest(request)}.bin`,
    duration_sec: 0,
    stub: true,
  };
}

/**
 * 記録された呼び出しを返します。
 * @returns {{operation: string, prompt: string, model: string, materialId: string}[]}
 */
function recordedCalls() {
  return calls.slice();
}

/** 記録を初期化します。 */
function reset() {
  calls.length = 0;
}

module.exports = { generate, recordedCalls, reset };
