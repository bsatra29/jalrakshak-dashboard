import type { NextConfig } from "next";
import path from "node:path";

/**
 * Demo mode: with no Firebase project configured (or NEXT_PUBLIC_DEMO_MODE=1),
 * the firebase/* imports are swapped for the in-browser stand-ins in src/demo,
 * which serve the invented data in public/data/fleet.json. Set the six
 * NEXT_PUBLIC_FIREBASE_* values (and leave NEXT_PUBLIC_DEMO_MODE unset) to use
 * a real project; no other code changes are needed.
 */
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "1" || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const aliases: Record<string, string> = demo
  ? {
      "firebase/app": "./src/demo/app.ts",
      "firebase/auth": "./src/demo/auth.ts",
      "firebase/firestore": "./src/demo/firestore.ts",
    }
  : {};

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_DEMO_MODE: demo ? "1" : "" },
  turbopack: { resolveAlias: aliases },
  // Same aliases for `next build --webpack`.
  webpack: (config) => {
    for (const [from, to] of Object.entries(aliases)) config.resolve.alias[`${from}$`] = path.resolve(to);
    return config;
  },
};

export default nextConfig;
