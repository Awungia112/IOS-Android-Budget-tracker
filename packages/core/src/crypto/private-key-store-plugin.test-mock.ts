import { vi } from 'vitest';

export const privateKeyStoreMockStore = new Map<string, string>();

export const PrivateKeyStore = {
  set: vi.fn(async ({ service, value }: { service: string; value: string }) => {
    privateKeyStoreMockStore.set(service, value);
  }),
  get: vi.fn(async ({ service }: { service: string }) => {
    if (!privateKeyStoreMockStore.has(service)) {
      throw new Error('Item with given service does not exist.');
    }

    return { value: privateKeyStoreMockStore.get(service) ?? '' };
  }),
  remove: vi.fn(async ({ service }: { service: string }) => {
    privateKeyStoreMockStore.delete(service);
  }),
  isHardwareBacked: vi.fn(async () => ({ value: true })),
};

export function resetPrivateKeyStoreMock(): void {
  privateKeyStoreMockStore.clear();
  vi.clearAllMocks();
}
