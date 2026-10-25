import { parseBuffer } from 'music-metadata';

export const maxEpisodeDurationSeconds = 120;
export const narrationWordTarget = { min: 180, max: 220 } as const;

export function isPublishableDuration(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= maxEpisodeDurationSeconds;
}

export async function measureDurationFromMp3(bytes: Buffer): Promise<number> {
  const metadata = await parseBuffer(bytes, { mimeType: 'audio/mpeg', size: bytes.length });
  if (metadata.format.codec !== 'MPEG 1 Layer 3' || !Number.isFinite(metadata.format.duration)) {
    throw new Error('The generated audio is not a valid MP3 recording.');
  }

  return metadata.format.duration!;
}
