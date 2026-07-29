import { Router, type Request, type Response } from "express";
import fs from "node:fs";

const router = Router();

type ReleasePlatform = "android" | "ios" | "windows" | "macos" | "web";

interface AppReleaseLink {
  platform: ReleasePlatform;
  label: string;
  href: string;
  version?: string;
  minRequirement?: string;
  available: boolean;
  external?: boolean;
}

interface AppReleaseManifest {
  appName?: string;
  latestVersion?: string;
  updatedAt?: string;
  links?: Partial<AppReleaseLink>[];
}

interface PlatformConfig {
  platform: ReleasePlatform;
  label: string;
  envKey: string;
  minRequirement: string;
  external?: boolean;
}

const platformConfigs: PlatformConfig[] = [
  {
    platform: "android",
    label: "Android APK",
    envKey: "CRAFTMATCH_ANDROID_DOWNLOAD_URL",
    minRequirement: "Android 8.0 or newer",
    external: true,
  },
  {
    platform: "ios",
    label: "iPhone",
    envKey: "CRAFTMATCH_IOS_DOWNLOAD_URL",
    minRequirement: "iOS 15 or newer",
    external: true,
  },
  {
    platform: "windows",
    label: "Windows",
    envKey: "CRAFTMATCH_WINDOWS_DOWNLOAD_URL",
    minRequirement: "Windows 10 or newer",
    external: true,
  },
  {
    platform: "macos",
    label: "macOS",
    envKey: "CRAFTMATCH_MACOS_DOWNLOAD_URL",
    minRequirement: "macOS 12 or newer",
    external: true,
  },
  {
    platform: "web",
    label: "Web App",
    envKey: "CRAFTMATCH_WEB_APP_URL",
    minRequirement: "Latest Chrome, Edge, Safari, or Firefox",
    external: true,
  },
];

function releaseLink(config: PlatformConfig): AppReleaseLink {
  const href = process.env[config.envKey]?.trim() ?? "";
  return {
    platform: config.platform,
    label: config.label,
    href,
    version: process.env.CRAFTMATCH_APP_VERSION?.trim() || "1.0.0",
    minRequirement: config.minRequirement,
    available: href.length > 0,
    external: config.external,
  };
}

function envReleaseLinks(): AppReleaseLink[] {
  return platformConfigs.map(releaseLink);
}

function readManifest(): AppReleaseManifest | null {
  try {
    const manifestJson = process.env.CRAFTMATCH_RELEASE_MANIFEST_JSON?.trim();
    if (manifestJson) return JSON.parse(manifestJson) as AppReleaseManifest;

    const manifestPath = process.env.CRAFTMATCH_RELEASE_MANIFEST_PATH?.trim();
    if (!manifestPath || !fs.existsSync(manifestPath)) return null;

    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AppReleaseManifest;
  } catch {
    return null;
  }
}

function mergeManifestLinks(manifestLinks: Partial<AppReleaseLink>[] | undefined): AppReleaseLink[] {
  const fallbackLinks = envReleaseLinks();
  if (!manifestLinks?.length) return fallbackLinks;

  const manifestByPlatform = new Map(
    manifestLinks
      .filter((link): link is Partial<AppReleaseLink> & { platform: ReleasePlatform } => Boolean(link.platform))
      .map((link) => [link.platform, link]),
  );

  return fallbackLinks.map((fallback) => {
    const manifest = manifestByPlatform.get(fallback.platform);
    if (!manifest) return fallback;
    const href = manifest.href?.trim() ?? fallback.href;
    return {
      ...fallback,
      ...manifest,
      href,
      available: manifest.available ?? href.length > 0,
    };
  });
}

router.get("/app", (_req: Request, res: Response) => {
  const manifest = readManifest();
  const latestVersion =
    manifest?.latestVersion?.trim() || process.env.CRAFTMATCH_APP_VERSION?.trim() || "1.0.0";

  res.status(200).json({
    success: true,
    data: {
      appName: manifest?.appName?.trim() || "CraftMatch",
      latestVersion,
      updatedAt:
        manifest?.updatedAt?.trim() ||
        process.env.CRAFTMATCH_RELEASE_UPDATED_AT?.trim() ||
        new Date().toISOString(),
      links: mergeManifestLinks(manifest?.links).map((link) => ({
        ...link,
        version: link.version || latestVersion,
      })),
    },
  });
});

export default router;
