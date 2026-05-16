import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Bundle ID derived from our owned domain (projectfymo.com) per Apple/Google
  // reverse-DNS convention. WARNING: once the app is published to App Store /
  // Play Store, this ID is permanent — changing it requires re-publishing as a
  // new app listing and losing existing installs/ratings/reviews.
  appId: 'com.projectfymo.app',
  appName: 'Fymo',
  webDir: 'build'
};

export default config;
