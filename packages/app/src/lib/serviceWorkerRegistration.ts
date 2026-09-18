import { Capacitor } from '@capacitor/core'
import { registerSW } from './pwaRegister'

export function registerServiceWorkerIfWeb() {
  if (Capacitor.isNativePlatform()) {
    return false
  }

  registerSW({
    onNeedRefresh() {
      const refresh = window.confirm(
        'A new version of Budget Wise is available. Would you like to reload to update?'
      )
      if (refresh) {
        window.location.reload()
      }
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error)
    },
    onOfflineReady() {
      console.log('App ready for offline use')
    },
  })

  return true
}
