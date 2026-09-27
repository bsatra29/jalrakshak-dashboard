/* eslint-disable @typescript-eslint/no-unused-vars -- signatures mirror the Firebase SDK */
/** Demo build replacement for "firebase/app" (aliased in next.config.ts). */
export type FirebaseApp = { name: string };

const APP: FirebaseApp = { name: "[DEFAULT]" };
let created = false;

export function initializeApp(..._args: unknown[]): FirebaseApp {
  created = true;
  return APP;
}
export const getApps = (): FirebaseApp[] => (created ? [APP] : []);
export const getApp = (): FirebaseApp => APP;
