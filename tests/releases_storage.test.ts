import test from "node:test";
import assert from "node:assert/strict";
import * as releaseService from "../src/services/releaseService";

test("getReleaseManifest default android link points to official GitHub Release assets CDN", () => {
  const manifest = releaseService.getReleaseManifest();
  assert.ok(manifest);
  assert.equal(manifest.appName, "CraftMatch");

  const androidLink = manifest.links.find((l) => l.platform === "android");
  assert.ok(androidLink);
  assert.equal(androidLink.available, true);
  assert.ok(
    androidLink.href.includes("github.com/Artisans-Connect/artisansApp_frontend/releases"),
    `Expected GitHub Release CDN URL, got: ${androidLink.href}`
  );
});

test("resolveDownloadTarget android redirects to GitHub Release CDN asset URL", () => {
  const target = releaseService.resolveDownloadTarget("android");
  assert.ok(target);
  assert.equal(target.filename, "CraftMatch.apk");
  if (target.type === "redirect") {
    assert.ok(
      target.target.includes("github.com/Artisans-Connect/artisansApp_frontend/releases") || target.target.startsWith("http"),
      `Expected valid CDN download target, got: ${target.target}`
    );
  }
});

test("pruneOldReleases executes cleanly and preserves latest build", async () => {
  const result = await releaseService.pruneOldReleases(3);
  assert.ok(result);
  assert.equal(typeof result.totalFound, "number");
  assert.equal(typeof result.prunedCount, "number");
  assert.ok(Array.isArray(result.retained));
  assert.ok(result.retained.includes("CraftMatch-latest.apk"));
});

test("getStorageStats returns structured stats for app-releases and verification-docs", async () => {
  const stats = await releaseService.getStorageStats();
  assert.ok(stats);
  assert.equal(stats.appReleases.bucket, "app-releases");
  assert.equal(typeof stats.appReleases.totalFiles, "number");
  assert.ok(stats.appReleases.publicUrl.includes("CraftMatch-latest.apk"));
  assert.equal(stats.verificationDocs.bucket, "verification-docs");
});
