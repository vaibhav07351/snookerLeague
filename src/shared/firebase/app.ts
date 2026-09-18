import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';

import { getFirebaseConfig, preferLocalData } from '@/shared/firebase/config';
import { logger } from '@/shared/logging/logger';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let authReady: Promise<User | null> | null = null;

export function isFirebaseEnabled(): boolean {
  return !preferLocalData() && getFirebaseConfig() !== null;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseEnabled()) {
    return null;
  }
  if (app) {
    return app;
  }
  const config = getFirebaseConfig();
  if (!config) {
    return null;
  }
  app = getApps().length > 0 ? getApps()[0]! : initializeApp(config);
  logger.info('firebase', 'Firebase app initialized', { projectId: config.projectId });
  return app;
}

function createAuth(firebaseApp: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return getAuth(firebaseApp);
  }

  // RN build of firebase/auth exports getReactNativePersistence; web typings omit it.
  const rnAuth = require('firebase/auth') as typeof import('firebase/auth') & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  };

  try {
    return initializeAuth(firebaseApp, {
      persistence: rnAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Hot reload / second init — Auth already registered on this app.
    return getAuth(firebaseApp);
  }
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    return null;
  }
  if (!auth) {
    auth = createAuth(firebaseApp);
  }
  return auth;
}

/**
 * Resolves once Firebase Auth has restored (or confirmed null) the session.
 * Call before any Firestore sync so request.auth is populated.
 */
export function waitForFirebaseAuth(): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    return Promise.resolve(null);
  }
  if (firebaseAuth.currentUser) {
    return Promise.resolve(firebaseAuth.currentUser);
  }
  if (!authReady) {
    authReady = new Promise((resolve) => {
      const unsub = onAuthStateChanged(firebaseAuth, (user) => {
        unsub();
        resolve(user);
      });
    });
  }
  return authReady;
}

/** True when Firebase Auth uid matches the local Google session user. */
export function hasFirebaseAuthForUid(uid: string): boolean {
  const firebaseAuth = getFirebaseAuth();
  return firebaseAuth?.currentUser?.uid === uid;
}

export function getFirestoreDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    return null;
  }
  if (!db) {
    db = getFirestore(firebaseApp);
  }
  return db;
}
