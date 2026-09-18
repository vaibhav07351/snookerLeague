import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { getFirebaseConfig, useLocalData } from '@/shared/firebase/config';
import { logger } from '@/shared/logging/logger';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function isFirebaseEnabled(): boolean {
  return !useLocalData() && getFirebaseConfig() !== null;
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

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    return null;
  }
  if (!auth) {
    auth = getAuth(firebaseApp);
  }
  return auth;
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
