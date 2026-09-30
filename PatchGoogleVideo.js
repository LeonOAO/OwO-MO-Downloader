import fs from "node:fs";
const file = "node_modules/googlevideo/dist/src/core/SabrStream.js";
let source = fs.readFileSync(file, "utf8");
if (source.includes("const playbackClockStartedAt = Date.now()")) {
  console.log("[OK] googlevideo realtime clock patch already applied.");
  process.exit(0);
}
const oldLoop = "            while (parseInt(abrState.playerTimeMs) < this.durationMs) {";
const newLoop = "            const playbackClockStartedAt = Date.now() - Number(playerTimeMs || 0);\n            const maxReadaheadMs = Math.max(15000, Number(options.maxReadaheadMs || 45000));\n            while (parseInt(abrState.playerTimeMs) < this.durationMs) {";
const oldProgress = "                abrState.playerTimeMs = this.mainFormat ? getTotalDownloadedDuration(this.mainFormat) : 0;\n                const { shouldStop } = this.checkForStall({\n                    playerTimeMs: abrState.playerTimeMs,";
const newProgress = "                const downloadedDurationMs = this.mainFormat ? getTotalDownloadedDuration(this.mainFormat) : 0;\n                const elapsedPlaybackMs = Math.min(this.durationMs, Math.max(0, Date.now() - playbackClockStartedAt));\n                const readaheadMs = downloadedDurationMs - elapsedPlaybackMs;\n                if (readaheadMs > maxReadaheadMs) {\n                    await new Promise(resolve => setTimeout(resolve, Math.min(5000, readaheadMs - maxReadaheadMs)));\n                }\n                abrState.playerTimeMs = Math.min(downloadedDurationMs, Math.max(0, Date.now() - playbackClockStartedAt));\n                const { shouldStop } = this.checkForStall({\n                    playerTimeMs: downloadedDurationMs,";
if (!source.includes(oldLoop) || !source.includes(oldProgress)) throw new Error("googlevideo 4.1.1 SabrStream source layout changed; patch stopped.");
source = source.replace(oldLoop, newLoop).replace(oldProgress, newProgress);
fs.writeFileSync(file, source);
console.log("[OK] googlevideo realtime clock patch applied.");
