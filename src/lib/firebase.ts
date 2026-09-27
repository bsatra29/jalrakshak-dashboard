import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

/**
 * Everything is created lazily so that importing this file during the
 * server-side prerender (where there is no browser and possibly no env vars)
 * never throws. Call these only from effects and event handlers.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Demo builds swap Firebase for in-browser demo data (see next.config.ts). */
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export const firebaseConfigured = demoMode || Boolean(config.apiKey && config.projectId && config.appId);

/** Set NEXT_PUBLIC_USE_EMULATOR=1 to develop against `firebase emulators:start` instead of the live project. */
const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === "1";

let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(getFirebaseApp());
  if (useEmulator) connectAuthEmulator(authInstance, "http://127.0.0.1:9099", { disableWarnings: true });
  return authInstance;
}

/**
 * Units in remote villages sync when the network returns, and officers work
 * from tablets in the field, so Firestore keeps an on-device cache: the last
 * data seen stays readable offline.
 */
export function getDb(): Firestore {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (useEmulator) connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  } catch {
    // Already initialised (hot reload) or persistence unsupported in this browser.
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}
