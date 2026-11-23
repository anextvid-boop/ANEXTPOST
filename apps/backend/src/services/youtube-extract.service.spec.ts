import {
  buildEvenFallbackSegments,
  isValidYoutubeUrl,
  parseVttCues,
} from './youtube-extract.service';

describe('YoutubeExtractService helpers', () => {
  it('validates YouTube URLs and rejects non-YouTube domains', () => {
    expect(isValidYoutubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe(true);
    expect(isValidYoutubeUrl('https://youtu.be/jNQXAC9IVRw')).toBe(true);
    expect(isValidYoutubeUrl('https://youtube.com/shorts/abc123')).toBe(true);
    expect(isValidYoutubeUrl('http://127.0.0.1:3000/secret')).toBe(false);
    expect(isValidYoutubeUrl('https://evil.example.com/watch?v=1')).toBe(false);
    expect(isValidYoutubeUrl('not a url')).toBe(false);
  });

  it('parses VTT cues into deduplicated timestamped segments', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:03.500 align:start position:0%',
      '<c>Hello</c> world',
      '',
      '00:00:03.500 --> 00:00:05.000',
      'Hello world',
      '',
      '00:00:05.000 --> 00:00:08.250',
      'Second sentence here',
    ].join('\n');

    expect(parseVttCues(vtt)).toEqual([
      { startSec: 1, endSec: 5, text: 'Hello world' },
      { startSec: 5, endSec: 8.25, text: 'Second sentence here' },
    ]);
  });

  it('builds even fallback segments when video exceeds max duration', () => {
    expect(buildEvenFallbackSegments(19, 3, 20, 60)).toEqual([
      { startSec: 0, endSec: 19, title: 'Clip 1' },
    ]);
    const multi = buildEvenFallbackSegments(240, 3, 20, 60);
    expect(multi).toHaveLength(3);
    expect(multi[0]).toEqual({ startSec: 0, endSec: 45, title: 'Clip 1' });
  });
});
