import 'dotenv/config';

const localSecret = 'bit-by-ear-local-only-session-key-change-before-deploy';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
}

export const config = {
  isProduction,
  port: Number(process.env.PORT || 3000),
  appOrigin: process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'postgres://bitbyeardev:bitbyeardev@localhost:5432/bitbyeardev',
  sessionSecret: process.env.SESSION_SECRET || localSecret,
  providerMode: process.env.PROVIDER_MODE || 'mock',
  openRouterKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'z-ai/glm-5.3-flash',
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoice: process.env.ELEVENLABS_VOICE_ID || '',
  elevenLabsModel: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:you@example.com',
};

export function providersReady(): boolean {
  if (config.providerMode === 'mock') return true;
  return Boolean(config.openRouterKey && config.elevenLabsKey && config.elevenLabsVoice);
}
