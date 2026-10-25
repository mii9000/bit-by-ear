import { api, post } from './api.js';

export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PushSettings = { enabled: boolean; publicKey: string | null };

export async function enablePush(settings: PushSettings): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('This browser does not support app notifications. Your episodes will still appear in the library.');
  if (!settings.enabled || !settings.publicKey) throw new Error('Notifications are not configured for this app yet. Your episodes will still appear here.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are off. You can enable them in your device settings later.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(settings.publicKey) });
  await post('/api/push/subscriptions', subscription.toJSON());
}

export async function removePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`;
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}
