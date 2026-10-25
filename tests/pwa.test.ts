import { afterEach, expect, it, vi } from 'vitest';
import { enablePush } from '../src/client/pwa.js';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('explains unavailable notifications without asking for browser permission', async () => {
  const notification = { requestPermission: vi.fn().mockResolvedValue('granted') };
  vi.stubGlobal('Notification', notification);
  vi.stubGlobal('window', { Notification: notification, PushManager: class {} });
  vi.stubGlobal('navigator', { serviceWorker: {} });

  await expect(enablePush({ enabled: false, publicKey: null })).rejects.toThrow('Notifications are not configured');
  expect(notification.requestPermission).not.toHaveBeenCalled();
});
