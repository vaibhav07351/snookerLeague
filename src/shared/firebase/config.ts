import Constants from 'expo-constants';

export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function env(key: string): string {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return (process.env[key] ?? extra?.[key] ?? '').trim();
}

export function getFirebaseConfig(): FirebasePublicConfig | null {
  const config: FirebasePublicConfig = {
    apiKey: env('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: env('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: env('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: env('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('EXPO_PUBLIC_FIREBASE_APP_ID'),
  };

  const values = Object.values(config);
  if (values.some((v) => v.length === 0)) {
    return null;
  }
  return config;
}

export function useLocalData(): boolean {
  if (env('EXPO_PUBLIC_USE_LOCAL_DATA') === 'true') {
    return true;
  }
  return getFirebaseConfig() === null;
}

export function getGoogleWebClientId(): string {
  return env('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
}
