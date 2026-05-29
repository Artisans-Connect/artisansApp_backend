import admin from "firebase-admin";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { env } from "./env";

function loadServiceAccount(): admin.ServiceAccount {
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
  }

  const serviceAccountPath = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH!);
  if (!existsSync(serviceAccountPath)) {
    throw new Error(`Firebase service account file not found: ${serviceAccountPath}`);
  }

  return JSON.parse(readFileSync(serviceAccountPath, "utf8"));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

export const firebaseAdmin = admin;
