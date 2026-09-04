import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import { logger } from "../utils/logger";
import { appError } from "../utils/appError";

export type ReleasePlatform = "android" | "ios" | "windows" | "macos" | "web";

export interface AppReleaseLink {
  platform: ReleasePlatform;
  label: string;
  href: string;
  version?: string;
  fileSize?: string;
  fileSizeBytes?: number;
  sha256?: string;
  minRequirement?: string;
  available: boolean;
  external?: boolean;
}

export interface AppReleaseManifest {
  appName: string;
  latestVersion: string;
  updatedAt: string;
  releaseNotes?: string;
  links: AppReleaseLink[];
}

export interface BuildTriggerParams {
  version?: string;
  releaseNotes?: string;
  releaseType?: "release" | "debug";
}

export interface BuildStatusResponse {
  status: "idle" | "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "timed_out" | null;
  runId?: number;
  runUrl?: string;
  runName?: string;
  version?: string;
  startedAt?: string;
  updatedAt?: string;
  durationSeconds?: number;
  message?: string;
}

import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";

export const APP_RELEASES_BUCKET = "app-releases";
const SUPABASE_APP_RELEASES_URL = `${env.SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${APP_RELEASES_BUCKET}/CraftMatch-latest.apk`;

const GITHUB_ORG = process.env.GITHUB_RELEASE_ORG || "Artisans-Connect";
const GITHUB_REPO = process.env.GITHUB_RELEASE_REPO || "artisansApp_frontend";
const GITHUB_WORKFLOW = "build-android-release.yml";

// Locate public downloads directory
const downloadsDir = path.resolve(process.cwd(), "public", "downloads");
const manifestPath = path.join(downloadsDir, "release-manifest.json");

function ensureDownloadsDirectory() {
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
}

/**
 * Ensure the public app-releases bucket exists in Supabase Storage
 */
export async function ensureAppReleasesBucket(): Promise<void> {
  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      logger("[ReleaseService] Warning listing storage buckets:", error.message);
      return;
    }
    const exists = buckets?.some((b) => b.name === APP_RELEASES_BUCKET);
    if (!exists) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(APP_RELEASES_BUCKET, {
        public: true,
        fileSizeLimit: 157286400, // 150 MB
        allowedMimeTypes: [
          "application/vnd.android.package-archive",
          "application/octet-stream",
          "application/x-zip-compressed",
        ],
      });
      if (createError) {
        logger("[ReleaseService] Error creating app-releases bucket:", createError.message);
      } else {
        logger("[ReleaseService] Successfully created public 'app-releases' bucket in Supabase Storage");
      }
    }
  } catch (err) {
    logger("[ReleaseService] Unexpected error ensuring app-releases bucket:", err);
  }
}

const defaultPlatforms: Array<{
  platform: ReleasePlatform;
  label: string;
  envKey: string;
  minRequirement: string;
  defaultHref: string;
  external: boolean;
}> = [
  {
    platform: "android",
    label: "Android APK",
    envKey: "CRAFTMATCH_ANDROID_DOWNLOAD_URL",
    minRequirement: "Android 8.0 or newer",
    defaultHref: SUPABASE_APP_RELEASES_URL,
    external: false,
  },
  {
    platform: "web",
    label: "Web PWA",
    envKey: "CRAFTMATCH_WEB_APP_URL",
    minRequirement: "Latest Chrome, Edge, Safari, or Firefox",
    defaultHref: "https://artisans-app-frontend.vercel.app/",
    external: true,
  },
  {
    platform: "ios",
    label: "iPhone",
    envKey: "CRAFTMATCH_IOS_DOWNLOAD_URL",
    minRequirement: "iOS 15 or newer",
    defaultHref: "",
    external: true,
  },
  {
    platform: "windows",
    label: "Windows",
    envKey: "CRAFTMATCH_WINDOWS_DOWNLOAD_URL",
    minRequirement: "Windows 10 or newer",
    defaultHref: "",
    external: true,
  },
  {
    platform: "macos",
    label: "macOS",
    envKey: "CRAFTMATCH_MACOS_DOWNLOAD_URL",
    minRequirement: "macOS 12 or newer",
    defaultHref: "",
    external: true,
  },
];

/**
 * Inspect local disk for APK file metadata
 */
function inspectLocalApk(): {
  exists: boolean;
  filePath: string;
  sizeBytes: number;
  sizeMB: string;
  sha256: string;
} {
  ensureDownloadsDirectory();
  const latestApk = path.join(downloadsDir, "CraftMatch-latest.apk");
  if (fs.existsSync(latestApk)) {
    const stats = fs.statSync(latestApk);
    const buffer = fs.readFileSync(latestApk);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const mb = `${(stats.size / (1024 * 1024)).toFixed(1)} MB`;
    return {
      exists: true,
      filePath: latestApk,
      sizeBytes: stats.size,
      sizeMB: mb,
      sha256: hash,
    };
  }
  return {
    exists: false,
    filePath: "",
    sizeBytes: 0,
    sizeMB: "",
    sha256: "",
  };
}

/**
 * Load release manifest from disk, environment, or default fallbacks
 */
export function getReleaseManifest(): AppReleaseManifest {
  ensureDownloadsDirectory();
  const localApk = inspectLocalApk();
  let fileManifest: Partial<AppReleaseManifest> | null = null;

  if (fs.existsSync(manifestPath)) {
    try {
      fileManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (err) {
      logger("[ReleaseService] Failed to parse release-manifest.json", err);
    }
  }

  const latestVersion =
    fileManifest?.latestVersion ||
    process.env.CRAFTMATCH_APP_VERSION?.trim() ||
    "1.0.0";

  const links: AppReleaseLink[] = defaultPlatforms.map((cfg) => {
    const manifestLink = fileManifest?.links?.find((l) => l.platform === cfg.platform);
    let href =
      process.env[cfg.envKey]?.trim() ||
      manifestLink?.href?.trim() ||
      cfg.defaultHref;

    let available = manifestLink?.available ?? (href.length > 0);
    let fileSize = manifestLink?.fileSize;
    let fileSizeBytes = manifestLink?.fileSizeBytes;
    let sha256 = manifestLink?.sha256;

    if (cfg.platform === "android") {
      if (localApk.exists) {
        available = true;
        fileSize = localApk.sizeMB;
        fileSizeBytes = localApk.sizeBytes;
        sha256 = localApk.sha256;
      } else if (href.includes("github.com")) {
        available = true;
        if (!fileSize) fileSize = "~38.5 MB";
      }
    }

    return {
      platform: cfg.platform,
      label: manifestLink?.label || cfg.label,
      href,
      version: manifestLink?.version || latestVersion,
      fileSize,
      fileSizeBytes,
      sha256,
      minRequirement: manifestLink?.minRequirement || cfg.minRequirement,
      available,
      external: manifestLink?.external ?? cfg.external,
    };
  });

  return {
    appName: fileManifest?.appName || "CraftMatch",
    latestVersion,
    updatedAt:
      fileManifest?.updatedAt ||
      process.env.CRAFTMATCH_RELEASE_UPDATED_AT?.trim() ||
      new Date().toISOString(),
    releaseNotes:
      fileManifest?.releaseNotes ||
      "Official CraftMatch mobile app with verified artisan matching and status tracking.",
    links,
  };
}

/**
 * Save release manifest to disk
 */
export function saveReleaseManifest(manifest: Partial<AppReleaseManifest>): AppReleaseManifest {
  ensureDownloadsDirectory();
  const current = getReleaseManifest();
  const updated: AppReleaseManifest = {
    appName: manifest.appName || current.appName,
    latestVersion: manifest.latestVersion || current.latestVersion,
    updatedAt: new Date().toISOString(),
    releaseNotes: manifest.releaseNotes ?? current.releaseNotes,
    links: current.links.map((link) => {
      const match = manifest.links?.find((l) => l.platform === link.platform);
      return match ? { ...link, ...match } : link;
    }),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

/**
 * Process incoming webhook from GitHub Actions build
 */
export function handleBuildWebhook(payload: {
  appName?: string;
  latestVersion: string;
  fileSize?: string;
  fileSizeBytes?: number;
  sha256?: string;
  downloadUrl: string;
  versionedDownloadUrl?: string;
  notes?: string;
}): AppReleaseManifest {
  const current = getReleaseManifest();
  const links = current.links.map((link) => {
    if (link.platform === "android") {
      return {
        ...link,
        href: payload.downloadUrl,
        version: payload.latestVersion,
        fileSize: payload.fileSize || link.fileSize,
        fileSizeBytes: payload.fileSizeBytes || link.fileSizeBytes,
        sha256: payload.sha256 || link.sha256,
        available: true,
      };
    }
    return link;
  });

  return saveReleaseManifest({
    appName: payload.appName || current.appName,
    latestVersion: payload.latestVersion,
    releaseNotes: payload.notes || current.releaseNotes,
    links,
  });
}

/**
 * Handle manual APK upload from Admin Portal, persisting directly to Supabase Storage
 */
export async function saveUploadedApk(
  file: Express.Multer.File,
  metadata: { version?: string; releaseNotes?: string }
): Promise<AppReleaseManifest> {
  await ensureAppReleasesBucket();

  const version = metadata.version?.trim() || "1.0.0";
  const versionedFileName = `CraftMatch-v${version}.apk`;
  const latestFileName = "CraftMatch-latest.apk";

  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const sizeMB = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

  // Upload both versioned APK and latest APK to Supabase Storage
  const uploadOptions = {
    contentType: "application/vnd.android.package-archive",
    upsert: true,
  };

  const [resVersioned, resLatest] = await Promise.all([
    supabaseAdmin.storage.from(APP_RELEASES_BUCKET).upload(versionedFileName, file.buffer, uploadOptions),
    supabaseAdmin.storage.from(APP_RELEASES_BUCKET).upload(latestFileName, file.buffer, uploadOptions),
  ]);

  if (resLatest.error) {
    logger("[ReleaseService] Error uploading CraftMatch-latest.apk to Supabase Storage:", resLatest.error.message);
    throw appError(500, `Failed to persist APK to cloud storage: ${resLatest.error.message}`, "STORAGE_UPLOAD_FAILED");
  }

  // Also write to local downloads directory as fallback if possible
  try {
    ensureDownloadsDirectory();
    fs.writeFileSync(path.join(downloadsDir, versionedFileName), file.buffer);
    fs.writeFileSync(path.join(downloadsDir, latestFileName), file.buffer);
  } catch (localErr) {
    logger("[ReleaseService] Local disk write fallback failed (non-fatal):", localErr);
  }

  // Get permanent public CDN URL
  const { data: publicUrlData } = supabaseAdmin.storage.from(APP_RELEASES_BUCKET).getPublicUrl(latestFileName);
  const publicCdnUrl = publicUrlData.publicUrl;

  const current = getReleaseManifest();
  const links = current.links.map((link) => {
    if (link.platform === "android") {
      return {
        ...link,
        href: publicCdnUrl,
        version,
        fileSize: sizeMB,
        fileSizeBytes: file.size,
        sha256: hash,
        available: true,
        external: false,
      };
    }
    return link;
  });

  const updatedManifest = saveReleaseManifest({
    latestVersion: version,
    releaseNotes: metadata.releaseNotes || current.releaseNotes,
    links,
  });

  // Automatically prune older releases, keeping the latest 3 versioned builds
  try {
    await pruneOldReleases(3);
  } catch (pruneErr) {
    logger("[ReleaseService] Post-upload auto-pruning encountered error (non-fatal):", pruneErr);
  }

  return updatedManifest;
}

/**
 * Prune old APK releases from Supabase Storage, keeping only the newest N versions.
 * 'CraftMatch-latest.apk' is never removed.
 */
export async function pruneOldReleases(keepCount = 3): Promise<{
  totalFound: number;
  prunedCount: number;
  retained: string[];
  pruned: string[];
}> {
  await ensureAppReleasesBucket();

  const { data: files, error } = await supabaseAdmin.storage
    .from(APP_RELEASES_BUCKET)
    .list("", { sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    logger("[ReleaseService] Error listing files in app-releases bucket:", error.message);
    throw appError(500, `Storage listing failed: ${error.message}`, "STORAGE_LIST_FAILED");
  }

  if (!files || files.length === 0) {
    return { totalFound: 0, prunedCount: 0, retained: ["CraftMatch-latest.apk"], pruned: [] };
  }

  // Filter versioned files like CraftMatch-v1.0.0.apk
  const versionedApks = files.filter(
    (f) => f.name.startsWith("CraftMatch-v") && f.name.endsWith(".apk")
  );

  const toKeep = versionedApks.slice(0, keepCount).map((f) => f.name);
  const toDelete = versionedApks.slice(keepCount).map((f) => f.name);

  if (toDelete.length > 0) {
    const { error: removeError } = await supabaseAdmin.storage
      .from(APP_RELEASES_BUCKET)
      .remove(toDelete);

    if (removeError) {
      logger("[ReleaseService] Error removing pruned APKs:", removeError.message);
      throw appError(500, `Failed to remove pruned APKs: ${removeError.message}`, "STORAGE_DELETE_FAILED");
    }
    logger(`[ReleaseService] Successfully pruned ${toDelete.length} old APK release(s): ${toDelete.join(", ")}`);
  }

  return {
    totalFound: files.length,
    prunedCount: toDelete.length,
    retained: ["CraftMatch-latest.apk", ...toKeep],
    pruned: toDelete,
  };
}

/**
 * Identify and delete orphaned document uploads in 'verification-docs' bucket
 * that have no corresponding database record in verification_documents.
 */
export async function cleanOrphanVerificationDocs(): Promise<{
  scannedFiles: number;
  orphanedCount: number;
  deletedFiles: string[];
  reclaimedBytes: number;
}> {
  const { data: dbDocs, error: dbErr } = await supabaseAdmin
    .from("verification_documents")
    .select("storage_path");

  if (dbErr) {
    logger("[ReleaseService] Error querying verification_documents for cleanup:", dbErr.message);
    throw appError(500, dbErr.message, "DB_FETCH_FAILED");
  }

  const validPaths = new Set(
    (dbDocs || [])
      .map((d) => d.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0)
  );

  const { data: rootItems, error: storageErr } = await supabaseAdmin.storage
    .from("verification-docs")
    .list("", { limit: 500 });

  if (storageErr) {
    logger("[ReleaseService] Error listing verification-docs bucket root:", storageErr.message);
    throw appError(500, storageErr.message, "STORAGE_LIST_FAILED");
  }

  const orphansToDelete: string[] = [];
  let reclaimedBytes = 0;
  let scannedCount = 0;

  for (const workerFolder of rootItems || []) {
    if (!workerFolder.id && workerFolder.name) {
      const { data: appFolders } = await supabaseAdmin.storage
        .from("verification-docs")
        .list(workerFolder.name, { limit: 100 });

      for (const appFolder of appFolders || []) {
        const subPath = `${workerFolder.name}/${appFolder.name}`;
        if (!appFolder.id) {
          const { data: docFiles } = await supabaseAdmin.storage
            .from("verification-docs")
            .list(subPath, { limit: 100 });

          for (const docFile of docFiles || []) {
            scannedCount++;
            const fullPath = `${subPath}/${docFile.name}`;
            if (!validPaths.has(fullPath)) {
              orphansToDelete.push(fullPath);
              reclaimedBytes += docFile.metadata?.size || 0;
            }
          }
        } else {
          scannedCount++;
          if (!validPaths.has(subPath)) {
            orphansToDelete.push(subPath);
            reclaimedBytes += appFolder.metadata?.size || 0;
          }
        }
      }
    }
  }

  if (orphansToDelete.length > 0) {
    for (let i = 0; i < orphansToDelete.length; i += 50) {
      const chunk = orphansToDelete.slice(i, i + 50);
      await supabaseAdmin.storage.from("verification-docs").remove(chunk);
    }
    logger(`[ReleaseService] Successfully cleaned ${orphansToDelete.length} orphan verification docs`);
  }

  return {
    scannedFiles: scannedCount,
    orphanedCount: orphansToDelete.length,
    deletedFiles: orphansToDelete,
    reclaimedBytes,
  };
}

/**
 * Query current storage utilization for App Releases and Verification Docs
 */
export async function getStorageStats(): Promise<{
  appReleases: {
    bucket: string;
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: string;
    files: Array<{ name: string; sizeMB: string; updatedAt: string; url: string }>;
    publicUrl: string;
  };
  verificationDocs: {
    bucket: string;
    registeredDocsCount: number;
  };
}> {
  await ensureAppReleasesBucket();

  const { data: files } = await supabaseAdmin.storage
    .from(APP_RELEASES_BUCKET)
    .list("", { sortBy: { column: "created_at", order: "desc" } });

  let totalSizeBytes = 0;
  const fileItems = (files || []).map((f) => {
    const size = f.metadata?.size || 0;
    totalSizeBytes += size;
    const { data: urlData } = supabaseAdmin.storage.from(APP_RELEASES_BUCKET).getPublicUrl(f.name);
    return {
      name: f.name,
      sizeMB: `${(size / (1024 * 1024)).toFixed(1)} MB`,
      updatedAt: f.updated_at || f.created_at || "",
      url: urlData.publicUrl,
    };
  });

  const { count: docsCount } = await supabaseAdmin
    .from("verification_documents")
    .select("*", { count: "exact", head: true });

  const { data: latestUrlData } = supabaseAdmin.storage.from(APP_RELEASES_BUCKET).getPublicUrl("CraftMatch-latest.apk");

  return {
    appReleases: {
      bucket: APP_RELEASES_BUCKET,
      totalFiles: fileItems.length,
      totalSizeBytes,
      totalSizeMB: `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
      files: fileItems,
      publicUrl: latestUrlData.publicUrl,
    },
    verificationDocs: {
      bucket: "verification-docs",
      registeredDocsCount: docsCount || 0,
    },
  };
}

/**
 * Resolve download target (local file streaming or external URL redirect)
 */
export function resolveDownloadTarget(platform: ReleasePlatform = "android"): {
  type: "file" | "redirect";
  target: string;
  filename: string;
  fileSizeBytes?: number;
} {
  if (platform === "android") {
    const localApk = inspectLocalApk();
    if (localApk.exists) {
      return {
        type: "file",
        target: localApk.filePath,
        filename: "CraftMatch.apk",
        fileSizeBytes: localApk.sizeBytes,
      };
    }

    const manifest = getReleaseManifest();
    const androidLink = manifest.links.find((l) => l.platform === "android");
    const { data: latestUrlData } = supabaseAdmin.storage.from(APP_RELEASES_BUCKET).getPublicUrl("CraftMatch-latest.apk");
    const fallbackUrl = latestUrlData.publicUrl;

    // Reject dead GitHub links and safely point to persistent Supabase Storage CDN URL
    const redirectUrl =
      androidLink?.href && androidLink.href.startsWith("http") && !androidLink.href.includes("github.com/Artisans-Connect")
        ? androidLink.href
        : fallbackUrl;

    return {
      type: "redirect",
      target: redirectUrl,
      filename: "CraftMatch.apk",
    };
  }

  const manifest = getReleaseManifest();
  const link = manifest.links.find((l) => l.platform === platform);
  if (!link || !link.href) {
    throw appError(404, `No download available for ${platform}`, "RELEASE_NOT_FOUND");
  }

  return {
    type: "redirect",
    target: link.href,
    filename: `CraftMatch-${platform}`,
  };
}

/**
 * Trigger GitHub Actions workflow via GitHub REST API
 */
export async function triggerGitHubBuild(params: BuildTriggerParams): Promise<{
  success: boolean;
  message: string;
  version: string;
  workflowUrl: string;
}> {
  const token =
    process.env.GITHUB_RELEASE_PAT ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN;

  const version = params.version?.trim() || "1.0.0";
  const releaseNotes = params.releaseNotes?.trim() || `CraftMatch Android Release v${version}`;
  const releaseType = params.releaseType || "release";
  const workflowUrl = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}`;

  if (!token) {
    // Return friendly instructions with direct link if token not set on server
    return {
      success: true,
      message:
        "GitHub token not configured on server. Open GitHub Actions directly to trigger with 1-click.",
      version,
      workflowUrl,
    };
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`;
    await axios.post(
      url,
      {
        ref: "main",
        inputs: {
          version,
          release_notes: releaseNotes,
          release_type: releaseType,
        },
      },
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    return {
      success: true,
      message: `Build successfully dispatched to GitHub Actions runner for v${version}.`,
      version,
      workflowUrl,
    };
  } catch (err: unknown) {
    logger("[ReleaseService] Error dispatching GitHub Action", err);
    const errorDetails = axios.isAxiosError(err) ? err.response?.data?.message || err.message : String(err);
    throw appError(
      502,
      `Failed to trigger GitHub Actions build: ${errorDetails}`,
      "BUILD_DISPATCH_FAILED"
    );
  }
}

/**
 * Query latest GitHub Actions build status
 */
export async function getLatestBuildStatus(): Promise<BuildStatusResponse> {
  const token =
    process.env.GITHUB_RELEASE_PAT ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN;

  const workflowUrl = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=1`;
    const response = await axios.get(url, { headers, timeout: 5000 });
    const run = response.data?.workflow_runs?.[0];

    if (!run) {
      return {
        status: "idle",
        conclusion: null,
        runUrl: workflowUrl,
        message: "No recent workflow runs found.",
      };
    }

    const startedAt = run.run_started_at || run.created_at;
    const updatedAt = run.updated_at;
    const durationSeconds =
      startedAt && updatedAt
        ? Math.round((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : undefined;

    return {
      status: run.status as "queued" | "in_progress" | "completed",
      conclusion: run.conclusion,
      runId: run.id,
      runUrl: run.html_url || workflowUrl,
      runName: run.name || "Build & Publish Android Release APK",
      startedAt,
      updatedAt,
      durationSeconds,
      message: `Workflow #${run.run_number} (${run.status} - ${run.conclusion || "active"})`,
    };
  } catch (err: unknown) {
    logger("[ReleaseService] Failed to query GitHub workflow status", err);
    return {
      status: "idle",
      conclusion: null,
      runUrl: workflowUrl,
      message: "GitHub status check temporarily unavailable.",
    };
  }
}
