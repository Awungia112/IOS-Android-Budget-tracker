import { registerPlugin } from '@capacitor/core';

export interface PrivateKeyStorePlugin {
  set(options: { service: string; value: string }): Promise<void>;
  get(options: { service: string }): Promise<{ value: string }>;
  remove(options: { service: string }): Promise<void>;
  /**
   * Returns whether the platform's storage is backed by a hardware security
   * module (Android Keystore TEE/StrongBox; iOS Secure Enclave via Keychain).
   * On iOS this is always true for devices with a Secure Enclave (iPhone 5s+).
   * On Android this reflects KeyInfo.isInsideSecureHardware — false on emulators
   * and on devices that fell back to software-backed Keystore.
   */
  isHardwareBacked(): Promise<{ value: boolean }>;
}

export const PrivateKeyStore = registerPlugin<PrivateKeyStorePlugin>('PrivateKeyStore', {
  web: () => import('./private-key-store-web').then((m) => new m.PrivateKeyStoreWeb()),
});
