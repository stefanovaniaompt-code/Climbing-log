import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'it.stefanovania.climbingcoach',
  appName: 'Climbing Coach',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Ricerca Tindeq…',
        cancel: 'Annulla',
        availableDevices: 'Dispositivi disponibili',
        noDeviceFound: 'Nessun Tindeq trovato',
      },
    },
  },
}

export default config
