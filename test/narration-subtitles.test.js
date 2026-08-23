const { synthesizeNarration, resolveSpeaker, defaultSpeaker } = require('../src/skills/spec-to-video/scripts/synthesize_narration.js');
const { buildSubtitles, formatTimestamp } = require('../src/skills/spec-to-video/scripts/build_subtitles.js');

const DEV = { SPEC_TO_VIDEO_ENV: 'development' };

/** @returns {Record<string, any>} */
function transcriptWithCuts() {
  return {
    version: '1',
    scenes: [
      {
        scene_id: 'S1',
        subtitle_lines: [{ text: 'ここから始まります', char_count: 9 }],
        narration_text: 'ここから始まります',
        figure_text: [],
        cuts: [
          { cut_id: 'C1', narration_text: 'ここから始まります' },
          { cut_id: 'C2', narration_text: '続けて説明します' },
        ],
      },
    ],
  };
}

describe('話者の決定', () => {
  test('既定は四国めたん（ノーマル）です', () => {
    expect(defaultSpeaker()).toContain('四国めたん');
  });

  test('設計書の指定があれば優先します', () => {
    expect(resolveSpeaker({ speaker: '別の話者' })).toBe('別の話者');
  });

  test('指定が空なら既定を使います', () => {
    expect(resolveSpeaker({ speaker: '' })).toBe(defaultSpeaker());
  });
});

describe('ナレーションの合成', () => {
  test('カット単位で実尺を計測し、台帳へ書き戻します', () => {
    const result = synthesizeNarration({
      transcript: transcriptWithCuts(),
      narrationSpec: { engine: 'local-tts', speaker: '四国めたん' },
      outputDir: 'out/audio',
      environment: DEV,
    });
    const scene = result.scenes[0];
    expect(scene.cuts[0].measured_narration_sec).toBeGreaterThan(0);
    expect(scene.cuts[1].audio_path).toContain('S1-C2');
    expect(scene.measured_narration_sec).toBeCloseTo(
      scene.cuts[0].measured_narration_sec + scene.cuts[1].measured_narration_sec,
      3,
    );
  });

  test('入力の台帳を書き換えません', () => {
    const input = transcriptWithCuts();
    synthesizeNarration({
      transcript: input,
      narrationSpec: { engine: 'local-tts' },
      outputDir: 'out/audio',
      environment: DEV,
    });
    expect(input.scenes[0].cuts[0].measured_narration_sec).toBeUndefined();
  });

  test('エンジンの指定が無い場合は停止します', () => {
    expect(() =>
      synthesizeNarration({
        transcript: transcriptWithCuts(),
        narrationSpec: {},
        outputDir: 'out/audio',
        environment: DEV,
      }),
    ).toThrow(/narration.engine|合成エンジン/);
  });

  test('カットが無いシーンは停止します', () => {
    const transcript = transcriptWithCuts();
    transcript.scenes[0].cuts = [];
    expect(() =>
      synthesizeNarration({
        transcript,
        narrationSpec: { engine: 'local-tts' },
        outputDir: 'out/audio',
        environment: DEV,
      }),
    ).toThrow();
  });

  test('本番環境で合成器が無い場合、代替へ切り替えず停止します', () => {
    expect(() =>
      synthesizeNarration({
        transcript: transcriptWithCuts(),
        narrationSpec: { engine: 'local-tts' },
        outputDir: 'out/audio',
        environment: { SPEC_TO_VIDEO_ENV: 'production' },
      }),
    ).toThrow();
  });
});

describe('字幕の生成', () => {
  /** @returns {Record<string, any>} */
  function measuredTranscript() {
    return {
      version: '1',
      scenes: [
        { scene_id: 'S1', subtitle_lines: [{ text: 'ここから始まります', char_count: 9 }], measured_narration_sec: 4 },
        { scene_id: 'S2', subtitle_lines: [{ text: '手順は三つです', char_count: 7 }], measured_narration_sec: 3 },
      ],
    };
  }

  test('時刻表記を組み立てます', () => {
    expect(formatTimestamp(0)).toBe('00:00:00,000');
    expect(formatTimestamp(3661.5)).toBe('01:01:01,500');
  });

  test('シーンを順に連結します', () => {
    const srt = buildSubtitles(measuredTranscript());
    expect(srt).toContain('00:00:00,000 --> 00:00:04,000');
    expect(srt).toContain('00:00:04,000 --> 00:00:07,000');
    expect(srt).toContain('手順は三つです');
  });

  test('実尺が未計測の場合は生成せず停止します', () => {
    const transcript = measuredTranscript();
    delete transcript.scenes[0].measured_narration_sec;
    expect(() => buildSubtitles(transcript)).toThrow();
  });

  test('文字数上限を超える字幕は生成せず停止します', () => {
    const transcript = measuredTranscript();
    transcript.scenes[0].subtitle_lines = [{ text: 'あ'.repeat(40), char_count: 40 }];
    expect(() => buildSubtitles(transcript)).toThrow();
  });

  test('表示時間が下限を下回る場合も停止します', () => {
    const transcript = measuredTranscript();
    transcript.scenes[0].measured_narration_sec = 0.5;
    expect(() => buildSubtitles(transcript)).toThrow();
  });
});
