import { AppState, Dimensions, NativeEventEmitter, NativeModules, Platform, Share } from 'react-native'

interface UtilsModuleType {
  exitApp: () => void
  getSupportedAbis: () => Promise<string[]>
  installApk: (filePath: string, fileProviderAuthority: string) => Promise<void>
  screenkeepAwake: () => void
  screenUnkeepAwake: () => void
  getWIFIIPV4Address: () => Promise<string>
  getDeviceName: () => Promise<string>
  isNotificationsEnabled: () => Promise<boolean>
  openNotificationPermissionActivity: () => Promise<boolean>
  shareText: (shareTitle: string, title: string, text: string) => void
  getSystemLocales: () => Promise<string>
  getWindowSize: () => Promise<{ width: number, height: number }>
  listenWindowSizeChanged: () => void
  isIgnoringBatteryOptimization: () => Promise<boolean>
  requestIgnoreBatteryOptimization: () => Promise<boolean>
}

const utilsModule = NativeModules.UtilsModule as UtilsModuleType | undefined
const isAndroid = Platform.OS === 'android'

const requireAndroidModule = (): UtilsModuleType => {
  if (utilsModule) return utilsModule
  throw new Error('UtilsModule is unavailable on this platform')
}

export const exitApp = () => {
  if (isAndroid) requireAndroidModule().exitApp()
}

export const getSupportedAbis = async(): Promise<string[]> => {
  if (!isAndroid) throw new Error('APK architecture detection is Android-only')
  return requireAndroidModule().getSupportedAbis()
}

export const installApk = async(filePath: string, fileProviderAuthority: string): Promise<void> => {
  if (!isAndroid) throw new Error('APK installation is Android-only')
  return requireAndroidModule().installApk(filePath, fileProviderAuthority)
}

export const screenkeepAwake = () => {
  if (global.lx.isScreenKeepAwake) return
  global.lx.isScreenKeepAwake = true
  if (isAndroid) requireAndroidModule().screenkeepAwake()
}

export const screenUnkeepAwake = () => {
  if (!global.lx.isScreenKeepAwake) return
  global.lx.isScreenKeepAwake = false
  if (isAndroid) requireAndroidModule().screenUnkeepAwake()
}

export const getWIFIIPV4Address = async(): Promise<string> => {
  if (!isAndroid) return '0.0.0.0'
  return requireAndroidModule().getWIFIIPV4Address()
}

export const getDeviceName = async(): Promise<string> => {
  if (!isAndroid) return (Platform.constants as { systemName?: string }).systemName ?? 'iOS'
  return requireAndroidModule().getDeviceName().then(deviceName => deviceName || 'Unknown')
}

export const isNotificationsEnabled = async(): Promise<boolean> => {
  if (!isAndroid) return true
  return requireAndroidModule().isNotificationsEnabled()
}

export const requestNotificationPermission = async(): Promise<boolean> => {
  if (!isAndroid) return true
  return new Promise<boolean>((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state != 'active') return
      subscription.remove()
      setTimeout(() => {
        void isNotificationsEnabled().then(resolve)
      }, 1000)
    })
    void requireAndroidModule().openNotificationPermissionActivity().then((result) => {
      if (result) return
      subscription.remove()
      resolve(false)
    })
  })
}

export const shareText = async(shareTitle: string, title: string, text: string): Promise<void> => {
  if (isAndroid) {
    requireAndroidModule().shareText(shareTitle, title, text)
    return
  }
  await Share.share({ title, message: text }, { dialogTitle: shareTitle })
}

export const getSystemLocales = async(): Promise<string> => {
  if (isAndroid) return requireAndroidModule().getSystemLocales()
  const settings = NativeModules.SettingsManager?.settings as {
    AppleLocale?: string
    AppleLanguages?: string[]
  } | undefined
  return settings?.AppleLocale ?? settings?.AppleLanguages?.[0] ?? 'en'
}

export const onScreenStateChange = (handler: (state: 'ON' | 'OFF') => void): (() => void) => {
  if (!isAndroid) {
    const subscription = AppState.addEventListener('change', state => {
      handler(state == 'active' ? 'ON' : 'OFF')
    })
    return () => {
      subscription.remove()
    }
  }
  const eventEmitter = new NativeEventEmitter(requireAndroidModule() as never)
  const eventListener = eventEmitter.addListener('screen-state', event => {
    handler(event.state as 'ON' | 'OFF')
  })
  return () => {
    eventListener.remove()
  }
}

export const getWindowSize = async(): Promise<{ width: number, height: number }> => {
  if (isAndroid) return requireAndroidModule().getWindowSize()
  const window = Dimensions.get('window')
  return {
    width: window.width * window.scale,
    height: window.height * window.scale,
  }
}

export const onWindowSizeChange = (handler: (size: { width: number, height: number }) => void): (() => void) => {
  if (!isAndroid) {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      handler({ width: window.width, height: window.height })
    })
    return () => {
      subscription.remove()
    }
  }
  const module = requireAndroidModule()
  module.listenWindowSizeChanged()
  const eventEmitter = new NativeEventEmitter(module as never)
  const eventListener = eventEmitter.addListener('screen-size-changed', event => {
    handler(event as { width: number, height: number })
  })
  return () => {
    eventListener.remove()
  }
}

export const isIgnoringBatteryOptimization = async(): Promise<boolean> => {
  if (!isAndroid) return true
  return requireAndroidModule().isIgnoringBatteryOptimization()
}

export const requestIgnoreBatteryOptimization = async(): Promise<boolean> => {
  if (!isAndroid) return true
  return new Promise<boolean>((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state != 'active') return
      subscription.remove()
      setTimeout(() => {
        void isIgnoringBatteryOptimization().then(resolve)
      }, 1000)
    })
    void requireAndroidModule().requestIgnoreBatteryOptimization().then((result) => {
      if (result) return
      subscription.remove()
      resolve(false)
    })
  })
}
