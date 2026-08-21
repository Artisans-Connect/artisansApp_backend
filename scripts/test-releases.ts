import { getReleaseManifest, resolveDownloadTarget, handleBuildWebhook } from "../src/services/releaseService";

console.log("=========================================");
console.log("Testing Backend Release Service");
console.log("=========================================");

// 1. Test getReleaseManifest
const manifest = getReleaseManifest();
console.log("\n[1] Active Manifest:", JSON.stringify(manifest, null, 2));

if (!manifest.appName || !manifest.links || manifest.links.length === 0) {
  console.error("FAIL: Manifest structure is invalid");
  process.exit(1);
}

const androidLink = manifest.links.find((l) => l.platform === "android");
if (!androidLink || !androidLink.available) {
  console.error("FAIL: Android link is missing or unavailable");
  process.exit(1);
}
console.log("PASS: Android link is available with size:", androidLink.fileSize);

// 2. Test resolveDownloadTarget
const download = resolveDownloadTarget("android");
console.log("\n[2] Resolved Download Target:", download);
if (!download.target) {
  console.error("FAIL: Download target could not be resolved");
  process.exit(1);
}
console.log("PASS: Download target resolved successfully:", download.type, download.target);

// 3. Test handleBuildWebhook
const updated = handleBuildWebhook({
  appName: "CraftMatch",
  latestVersion: "1.0.1",
  fileSize: "38.5 MB",
  fileSizeBytes: 40370176,
  sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  downloadUrl: "https://github.com/Artisans-Connect/artisansApp_frontend/releases/latest/download/CraftMatch-latest.apk",
  notes: "Automated test webhook",
});
console.log("\n[3] Webhook Update Result Version:", updated.latestVersion);
if (updated.latestVersion !== "1.0.1") {
  console.error("FAIL: Webhook did not update version");
  process.exit(1);
}
console.log("PASS: Webhook update verified!");

console.log("\nAll Release Service tests passed successfully! ✅");
