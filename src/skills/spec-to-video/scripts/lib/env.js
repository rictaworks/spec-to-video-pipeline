'use strict';

/**
 * 実行環境を判定し、課金を伴う外部呼び出しの経路を切り替えます。
 * 判定できない場合は既定値へ切り替えず、例外で停止します。
 */

const { t } = require('./strings.js');

const ENV_VAR = 'SPEC_TO_VIDEO_ENV';
const DEVELOPMENT = 'development';
const PRODUCTION = 'production';

/**
 * 実行環境を返します。
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {'development' | 'production'}
 */
function resolveMode(environment = process.env) {
  const value = environment[ENV_VAR];
  if (value === DEVELOPMENT || value === PRODUCTION) {
    return value;
  }
  throw new Error(t('env.unknown_mode', { name: ENV_VAR }));
}

/**
 * 開発環境かどうかを返します。
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {boolean}
 */
function isDevelopment(environment = process.env) {
  return resolveMode(environment) === DEVELOPMENT;
}

/**
 * 資格情報の環境変数名から値を取得します。値そのものは記録しません。
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {string}
 */
function requireCredential(name, environment = process.env) {
  const value = environment[name];
  if (value === undefined || value === '') {
    throw new Error(t('env.credential_missing', { name }));
  }
  return value;
}

module.exports = { ENV_VAR, DEVELOPMENT, PRODUCTION, resolveMode, isDevelopment, requireCredential };
