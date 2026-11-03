import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tech.soundrift.app',
  appName: 'Soundrift',
  webDir: 'dist',
  plugins: { CapacitorHttp: { enabled: true } },
};
export default config;
