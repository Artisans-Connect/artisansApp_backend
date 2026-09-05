import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requirePortalAdmin } from "../middleware/admin";
import { catchAsync } from "../utils/catchAsync";
import * as releaseService from "../services/releaseService";
import type { ReleasePlatform } from "../services/releaseService";

const router = Router();

const upload = multer({
  limits: { fileSize: 200 * 1024 * 1024 }, // Allow up to 200MB APK uploads
  storage: multer.memoryStorage(),
});

/**
 * Public Endpoint: Get active release manifest & platform links
 */
router.get(
  "/app",
  catchAsync(async (_req: Request, res: Response) => {
    const manifest = releaseService.getReleaseManifest();
    res.status(200).json({
      success: true,
      data: manifest,
    });
  }),
);

/**
 * Public Endpoint: Direct download / streaming for a platform (e.g. /download/android)
 */
router.get(
  "/download/:platform",
  catchAsync(async (req: Request, res: Response) => {
    const rawPlatform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
    const platform = (rawPlatform || "android").toLowerCase() as ReleasePlatform;
    const download = releaseService.resolveDownloadTarget(platform);

    if (download.type === "file") {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${download.filename}"`);
      if (download.fileSizeBytes) {
        res.setHeader("Content-Length", download.fileSizeBytes);
      }
      return res.sendFile(download.target);
    }

    // Redirect to CDN / external download URL
    return res.redirect(302, download.target);
  }),
);

/**
 * Public Endpoint: Shortcut for latest Android APK download
 */
router.get(
  "/download/latest",
  catchAsync(async (_req: Request, res: Response) => {
    const download = releaseService.resolveDownloadTarget("android");
    if (download.type === "file") {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${download.filename}"`);
      if (download.fileSizeBytes) {
        res.setHeader("Content-Length", download.fileSizeBytes);
      }
      return res.sendFile(download.target);
    }
    return res.redirect(302, download.target);
  }),
);

/**
 * Public/Protected Webhook: Receives build completion notifications from GitHub Actions
 */
router.post(
  "/webhook",
  catchAsync(async (req: Request, res: Response) => {
    const adminKey = process.env.VERIFICATION_ADMIN_KEY;
    const incomingKey = req.headers["x-verification-admin-key"] as string | undefined;

    // Optional verification if admin key is configured
    if (adminKey && incomingKey && incomingKey !== adminKey) {
      return res.status(401).json({ success: false, message: "Invalid webhook secret" });
    }

    const updatedManifest = releaseService.handleBuildWebhook(req.body);
    res.status(200).json({
      success: true,
      message: "Release manifest updated from build webhook",
      data: updatedManifest,
    });
  }),
);

/**
 * Admin Endpoint: Trigger GitHub Actions Cloud Build
 */
router.post(
  "/trigger-build",
  requirePortalAdmin,
  catchAsync(async (req: Request, res: Response) => {
    const result = await releaseService.triggerGitHubBuild({
      version: typeof req.body.version === "string" ? req.body.version : undefined,
      releaseNotes: typeof req.body.releaseNotes === "string" ? req.body.releaseNotes : undefined,
      releaseType: req.body.releaseType === "debug" ? "debug" : "release",
      githubToken: typeof req.body.githubToken === "string" ? req.body.githubToken : undefined,
    });
    res.status(200).json({ success: true, data: result });
  }),
);

/**
 * Admin Endpoint: Query latest GitHub Actions build status
 */
router.get(
  "/build-status",
  requirePortalAdmin,
  catchAsync(async (_req: Request, res: Response) => {
    const status = await releaseService.getLatestBuildStatus();
    res.status(200).json({ success: true, data: status });
  }),
);

/**
 * Admin Endpoint: Direct drag-and-drop APK upload (persists directly to Supabase Storage)
 */
router.post(
  "/upload",
  requirePortalAdmin,
  upload.single("file"),
  catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No APK file uploaded" });
    }

    const updated = await releaseService.saveUploadedApk(req.file, {
      version: typeof req.body.version === "string" ? req.body.version : undefined,
      releaseNotes: typeof req.body.releaseNotes === "string" ? req.body.releaseNotes : undefined,
    });

    res.status(201).json({
      success: true,
      message: "APK file uploaded and published to Supabase Storage distribution center",
      data: updated,
    });
  }),
);

/**
 * Admin Endpoint: Query Supabase Storage utilization stats for releases & verification docs
 */
router.get(
  "/storage/stats",
  requirePortalAdmin,
  catchAsync(async (_req: Request, res: Response) => {
    const stats = await releaseService.getStorageStats();
    res.status(200).json({ success: true, data: stats });
  }),
);

/**
 * Admin Endpoint: Trigger Supabase Storage cleanup (prune old APKs & orphan docs)
 */
router.post(
  "/storage/cleanup",
  requirePortalAdmin,
  catchAsync(async (req: Request, res: Response) => {
    const pruneReleases = req.body?.pruneReleases !== false;
    const pruneOrphans = req.body?.pruneOrphans === true;
    const keepVersionsCount = typeof req.body?.keepVersionsCount === "number" ? req.body.keepVersionsCount : 3;

    const cleanupDetails: Record<string, unknown> = {};

    if (pruneReleases) {
      cleanupDetails.releases = await releaseService.pruneOldReleases(keepVersionsCount);
    }
    if (pruneOrphans) {
      cleanupDetails.orphans = await releaseService.cleanOrphanVerificationDocs();
    }

    const updatedStats = await releaseService.getStorageStats();

    res.status(200).json({
      success: true,
      message: "Storage retention cleanup executed successfully",
      data: {
        cleanupDetails,
        currentStats: updatedStats,
      },
    });
  }),
);

/**
 * Admin Endpoint: Update release manifest links and settings
 */
router.put(
  "/manifest",
  requirePortalAdmin,
  catchAsync(async (req: Request, res: Response) => {
    const updated = releaseService.saveReleaseManifest(req.body);
    res.status(200).json({
      success: true,
      message: "Release settings updated successfully",
      data: updated,
    });
  }),
);

export default router;
