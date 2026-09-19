/**
 * Dynamic Expo config so EAS production builds can inject EXPO_PUBLIC_* env.
 * Local `npx expo start` still picks up `.env` automatically.
 * Plain JS — EAS/Expo config loaders do not reliably parse app.config.ts.
 */
module.exports = ({ config }) => ({
  ...config,
  name: 'Snooker League',
  slug: 'snooker-league',
  owner: 'vaibhav07351',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'snooker',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#071A10',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.snooker.league',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#071A10',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.snooker.league',
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: ['expo-router', 'expo-font', 'expo-web-browser', 'expo-splash-screen'],
  extra: {
    eas: {
      projectId: '66106947-8796-4241-8d9a-de50e4f04021',
    },
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_USE_LOCAL_DATA: process.env.EXPO_PUBLIC_USE_LOCAL_DATA,
  },
});
