import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { env } from "./env";

if (!admin.apps.length) {
  const serviceAccountPath = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const firebaseAdmin = admin;
