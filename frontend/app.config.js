/**
 * Dynamic Expo config so EAS production builds can inject EXPO_PUBLIC_* env.
 * Local `npx expo start` still picks up `.env` automatically.
 * Plain JS — EAS/Expo config loaders do not reliably parse app.config.ts.
 */
module.exports = ({ config }) => ({
  ...config,
  name: 'Snookit',
  slug: 'snooker-league',
  owner: 'vaibhav07351',
  version: '4.0.0',
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
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Snookit uses your location to suggest your city so you can see local players, city rankings, and live matches. We store your city, not a live GPS trail.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#071A10',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.snooker.league',
    googleServicesFile: './google-services.json',
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-web-browser',
    'expo-splash-screen',
    '@react-native-google-signin/google-signin',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Snookit uses your location to suggest your city so you can see local players, city rankings, and live matches. We store your city, not a live GPS trail.',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '66106947-8796-4241-8d9a-de50e4f04021',
    },
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_WEB_ORIGIN: process.env.EXPO_PUBLIC_WEB_ORIGIN,
    EXPO_PUBLIC_USE_LOCAL_DATA: process.env.EXPO_PUBLIC_USE_LOCAL_DATA,
  },
});
