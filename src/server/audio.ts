import { parseBuffer } from 'music-metadata';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { isPublishableDuration, maxEpisodeDurationSeconds } from '../shared/audio.js';

const maxAudioBytes = 8 * 1024 * 1024;
const mockMp3Frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);

export async function narrate(script: string): Promise<{ bytes: Buffer; durationSeconds: number }> {
  if (config.providerMode === 'mock') {
    const bytes = Buffer.concat(Array.from({ length: 6 }, () => mockMp3Frame));
    const metadata = await parseBuffer(bytes, { mimeType: 'audio/mpeg', size: bytes.length });
    const durationSeconds = metadata.format.duration ?? 0;
    if (!isPublishableDuration(durationSeconds)) throw new Error('The local sample audio could not be measured.');
    return { bytes, durationSeconds };
  }
  if (!config.elevenLabsKey || !config.elevenLabsVoice) throw new Error('Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to .env to create real audio.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoice)}`);
    url.searchParams.set('output_format', 'mp3_44100_128');
    const response = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'xi-api-key': config.elevenLabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: script, model_id: config.elevenLabsModel }),
    });
    if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}. Check the voice ID, API key, and available credits.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxAudioBytes) throw new Error('ElevenLabs returned empty audio or exceeded the 8 MB episode limit.');
    const metadata = await parseBuffer(bytes, { mimeType: 'audio/mpeg', size: bytes.length });
    if (metadata.format.codec !== 'MPEG 1 Layer 3' || !Number.isFinite(metadata.format.duration)) throw new Error('ElevenLabs did not return valid MP3 audio.');
    return { bytes, durationSeconds: metadata.format.duration! };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Audio generation timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function readByteRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return 'invalid';
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

export function isTooLong(durationSeconds: number): boolean {
  return durationSeconds > maxEpisodeDurationSeconds;
}
