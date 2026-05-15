import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // NOTE: appId is the iOS/Android bundle ID and CANNOT change once the app
  // is published to App Store / Play Store without re-publishing as a new app.
  // Keep this as 'com.financialhq.app' until ready to launch under a new bundle.
  appId: 'com.financialhq.app',
  appName: 'Fymo',
  webDir: 'build'
};

export default config;
