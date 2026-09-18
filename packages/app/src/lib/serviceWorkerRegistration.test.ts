import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorkerIfWeb } from './serviceWorkerRegistration'

const { isNativePlatform, registerSW } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  registerSW: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}))

vi.mock('./pwaRegister', () => ({
  registerSW,
}))

describe('registerServiceWorkerIfWeb', () => {
  beforeEach(() => {
    isNativePlatform.mockReset()
    registerSW.mockReset()
  })

  it('does not register a service worker in a native Capacitor app', () => {
    isNativePlatform.mockReturnValue(true)

    expect(registerServiceWorkerIfWeb()).toBe(false)
    expect(registerSW).not.toHaveBeenCalled()
  })

  it('registers the service worker for browser/PWA builds', () => {
    isNativePlatform.mockReturnValue(false)

    expect(registerServiceWorkerIfWeb()).toBe(true)
    expect(registerSW).toHaveBeenCalledOnce()
  })
})
