/**
 * Marks hardware features that Android infers from our config as optional, so Google Play does
 * not hide the app from devices without them:
 * - android.hardware.screen.portrait is implied by orientation: 'portrait'.
 * - android.hardware.wifi is implied by ACCESS_WIFI_STATE (added by expo-network).
 * The app still runs portrait-only and works on mobile data, so neither is a real requirement.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = manifest['uses-feature'] ?? [];

    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((feature) => feature.$['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }

    manifest['uses-feature'] = features;
    return mod;
  });
}

module.exports = withOptionalHardwareFeatures;
