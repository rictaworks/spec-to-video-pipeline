'use strict';

/**
 * 工程 P4: ナレーションをカット単位で合成し、実尺を計測して台本台帳へ書き戻します。
 * 合成エンジンが利用できない場合、別のエンジンへ切り替えずに停止します。
 */

const fs = require('node:fs');
const path = require('node:path');
const { t } = require('./lib/strings.js');
const { isDevelopment } = require('./lib/env.js');

const VALIDATION_PATH = path.join(__dirname, '..', 'config', 'validation.json');

/**
 * @typedef {{synthesize: (input: {text: string, speaker: string, engine: string, outputPath: string}) => {duration_sec: number, file_path: string}}} Synthesizer
 */

/**
 * 既定の話者を返します。設計書に指定がある場合は呼び出し側が優先します。
 * @returns {string}
 */
function defaultSpeaker() {
  return JSON.parse(fs.readFileSync(VALIDATION_PATH, 'utf8')).narration.default_speaker;
}

/**
 * 使用する話者を決めます。
 * @param {Record<string, any>} narrationSpec
 * @returns {string}
 */
function resolveSpeaker(narrationSpec) {
  const specified = narrationSpec && narrationSpec.speaker;
  return specified !== undefined && String(specified).trim() !== '' ? String(specified) : defaultSpeaker();
}

/**
 * 開発環境で用いるスタブの合成器です。外部通信を行いません。
 * @returns {Synthesizer}
 */
function stubSynthesizer() {
  return {
    synthesize(input) {
      return { duration_sec: input.text.length * 0.1, file_path: input.outputPath };
    },
  };
}

/**
 * カット単位でナレーションを合成し、実尺を台本台帳へ書き戻します。
 * @param {{transcript: Record<string, any>, narrationSpec: Record<string, any>, outputDir: string, synthesizer?: Synthesizer, environment?: NodeJS.ProcessEnv}} input
 * @returns {Record<string, any>}
 */
function synthesizeNarration(input) {
  const speaker = resolveSpeaker(input.narrationSpec);
  const engine = input.narrationSpec && input.narrationSpec.engine;
  if (engine === undefined || String(engine).trim() === '') {
    throw new Error(t('narration.engine_missing'));
  }

  const synthesizer = isDevelopment(input.environment)
    ? stubSynthesizer()
    : input.synthesizer;
  if (synthesizer === undefined) {
    throw new Error(t('narration.engine_unavailable', { engine: String(engine) }));
  }

  const transcript = JSON.parse(JSON.stringify(input.transcript));
  transcript.scenes.forEach((/** @type {Record<string, any>} */ scene) => {
    const cuts = Array.isArray(scene.cuts) ? scene.cuts : [];
    if (cuts.length === 0) {
      throw new Error(t('narration.no_cuts', { scene_id: String(scene.scene_id) }));
    }
    let total = 0;
    cuts.forEach((/** @type {Record<string, any>} */ cut) => {
      const outputPath = path.posix.join(input.outputDir, `${String(scene.scene_id)}-${String(cut.cut_id)}.wav`);
      const result = synthesizer.synthesize({
        text: String(cut.narration_text),
        speaker,
        engine: String(engine),
        outputPath,
      });
      if (!Number.isFinite(result.duration_sec) || result.duration_sec <= 0) {
        throw new Error(t('narration.measure_failed', { scene_id: String(scene.scene_id), cut_id: String(cut.cut_id) }));
      }
      cut.measured_narration_sec = result.duration_sec;
      cut.audio_path = result.file_path;
      total += result.duration_sec;
    });
    scene.measured_narration_sec = Number(total.toFixed(3));
  });
  return transcript;
}

module.exports = { synthesizeNarration, resolveSpeaker, defaultSpeaker, stubSynthesizer };
