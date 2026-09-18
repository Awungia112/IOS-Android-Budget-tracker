import { WebPlugin } from '@capacitor/core';
import type { PrivateKeyStorePlugin } from './private-key-store-plugin.js';

export class PrivateKeyStoreWeb extends WebPlugin implements PrivateKeyStorePlugin {
  async set(options: { service: string; value: string }): Promise<void> {
    localStorage.setItem(options.service, options.value);
  }

  async get(options: { service: string }): Promise<{ value: string }> {
    const value = localStorage.getItem(options.service);
    if (value === null) {
      throw new Error('Item does not exist');
    }
    return { value };
  }

  async remove(options: { service: string }): Promise<void> {
    localStorage.removeItem(options.service);
  }

  async isHardwareBacked(): Promise<{ value: boolean }> {
    // Web storage (localStorage) is never hardware-backed
    return { value: false };
  }
}
