/** Jest の設定です。テストは test/ 配下に配置します。 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['src/skills/**/*.js'],
  testTimeout: 30000,
};
