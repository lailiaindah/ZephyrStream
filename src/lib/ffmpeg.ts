// FFmpeg manager — spawns ffmpeg processes to stream video files via RTMP
// Uses the YouTube stream key (NOT the API) to push the live stream

import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";
import { FFMPEG_BINARY, FFPROBE_BINARY, STREAM_LOG_DIR } from "@/lib/constants";

export interface FFmpegOptions {
  streamKey: string;
  rtmpUrl: string;
  videoFiles: string[];
  encoder: string;
  copyMode: boolean;
  videoBitrate: string;
  audioBitrate: string;
  resolution: string;
  fps: number;
  preset: string;
  loopUntilDuration?: boolean;
  durationSeconds?: number;
  logFile?: string;
  // Auto-restart options
  maxRetries?: number;
  retryCount?: number;
  streamId?: string; // for logging
}

// Map our encoder choice to FFmpeg codec strings
function resolveEncoder(choice: string): { videoCodec: string; isGpu: boolean } {
  switch (choice) {
    case "x264":
      return { videoCodec: "libx264", isGpu: false };
    case "nvenc":
      return { videoCodec: "h264_nvenc", isGpu: true };
    case "qsv":
      return { videoCodec: "h264_qsv", isGpu: true };
    case "amf":
      return { videoCodec: "h264_amf", isGpu: true };
    case "videotoolbox":
      return { videoCodec: "h264_videotoolbox", isGpu: true };
    default:
      return { videoCodec: "libx264", isGpu: false };
  }
}

// Probe a video file with ffprobe to get its specs
export async function probeVideo(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  fps: number;
}> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(
      FFPROBE_BINARY,
      [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { timeout: 10000 }
    );

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
    const audioStream = data.streams?.find((s: any) => s.codec_type === "audio");

    const fpsParts = videoStream?.r_frame_rate?.split("/") || ["30", "1"];
    const fps = parseInt(fpsParts[0], 10) / parseInt(fpsParts[1] || "1", 10);

    return {
      duration: parseFloat(data.format?.duration || "0"),
      width: parseInt(videoStream?.width || "1920", 10),
      height: parseInt(videoStream?.height || "1080", 10),
      codec: videoStream?.codec_name || "unknown",
      bitrate: parseInt(data.format?.bit_rate || "0", 10),
      fps: fps || 30,
    };
  } catch (error) {
    return {
      duration: 0,
      width: 1920,
      height: 1080,
      codec: "unknown",
      bitrate: 0,
      fps: 30,
    };
  }
}

// Build a temporary concat list file for FFmpeg's concat demuxer.
// This is the reliable way to concatenate multiple video files in both
// copy and re-encode modes. Returns the path to the temp file, which
// the caller (or FFmpeg exit handler) should clean up.
async function buildConcatListFile(videoFiles: string[]): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const listFile = path.join(STREAM_LOG_DIR, `concat_${timestamp}.txt`);
  // FFmpeg concat demuxer format:
  // file 'path/to/file1.mp4'
  // file 'path/to/file2.mp4'
  const lines = videoFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listFile, lines, "utf-8");
  return listFile;
}

// Build the FFmpeg command arguments for streaming
function buildFFmpegArgs(opts: FFmpegOptions, concatListFile?: string): string[] {
  const { videoCodec } = resolveEncoder(opts.encoder);
  const rtmpEndpoint = opts.rtmpUrl.endsWith("/")
    ? `${opts.rtmpUrl}${opts.streamKey}`
    : `${opts.rtmpUrl}/${opts.streamKey}`;

  const args: string[] = ["-hide_banner", "-loglevel", "info"];

  // Single file: use -i directly. Multiple files: use concat demuxer
  // with a temporary list file (reliable for both copy and re-encode modes).
  if (concatListFile) {
    // Multiple files — use concat demuxer via -f concat -i list.txt
    args.push(
      "-re",
      "-stream_loop", "-1", // loop the concat list indefinitely
      "-f", "concat",
      "-safe", "0",
      "-i", concatListFile,
    );
  } else {
    // Single file
    args.push(
      "-re",
      "-stream_loop", "-1",
      "-i", opts.videoFiles[0],
    );
  }

  // Re-encode mode: normalize everything for stable playback
  if (!opts.copyMode) {
    // Parse the numeric part of videoBitrate (e.g. "4500k" -> 4500).
    // If the user typed something invalid like "K5" or "abc", fall back
    // to a safe default of 4500 to avoid `NaN` in the -bufsize argument,
    // which would cause FFmpeg to crash on launch.
    const bitrateNum = parseInt(opts.videoBitrate, 10);
    const safeBitrateNum = Number.isFinite(bitrateNum) && bitrateNum > 0 ? bitrateNum : 4500;
    const safeBitrateStr = `${safeBitrateNum}k`;

    args.push(
      "-c:v", videoCodec,
      "-preset", opts.preset,
      "-b:v", safeBitrateStr,
      "-maxrate", safeBitrateStr,
      "-bufsize", `${safeBitrateNum * 2}k`,
      "-vf", `scale=${opts.resolution.replace("x", ":")},format=yuv420p`,
      "-r", opts.fps.toString(),
      "-g", (opts.fps * 2).toString(), // Keyframe every 2 seconds
      "-c:a", "aac",
      "-b:a", opts.audioBitrate,
      "-ar", "44100",
      "-ac", "2",
      "-f", "flv",
      rtmpEndpoint
    );
  } else {
    // Copy mode: stream copy without re-encoding (works only when all videos share specs)
    args.push(
      "-c", "copy",
      "-f", "flv",
      rtmpEndpoint
    );
  }

  // Duration limit: place -t AFTER the input spec so it acts as an
  // output option (caps the total stream duration).
  if (opts.durationSeconds) {
    // Find the position right after the -i and its argument
    const iIndex = args.indexOf("-i");
    if (iIndex !== -1) {
      const afterInput = iIndex + 2; // skip "-i" and the filename/concat
      args.splice(afterInput, 0, "-t", opts.durationSeconds.toString());
    }
  }

  return args;
}

// Spawn an FFmpeg process to start streaming
export async function startFFmpegStream(opts: FFmpegOptions): Promise<{
  pid: number;
  logFile: string;
  process: ChildProcess;
}> {
  // Ensure log directory exists
  await fs.mkdir(STREAM_LOG_DIR, { recursive: true });

  // Use timestamp + random suffix for the log file name. Previously this
  // used only a millisecond-precision timestamp — two streams starting in
  // the same millisecond (e.g. batch start, or scheduler + manual start
  // coinciding) would collide on the same log file path. The second
  // `fs.open(logFile, "w")` would truncate the first stream's log, and
  // both streams' DB records would point to the same file. The random
  // suffix makes collisions astronomically unlikely.
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const logFile = path.join(STREAM_LOG_DIR, `stream_${timestamp}_${randomSuffix}.log`);
  const logHandle = await fs.open(logFile, "w");

  // If multiple video files, build a concat list file (temp, auto-cleaned)
  let concatListFile: string | undefined;
  if (opts.videoFiles.length > 1) {
    try {
      concatListFile = await buildConcatListFile(opts.videoFiles);
    } catch (err: any) {
      await logHandle.close().catch(() => {});
      throw new Error(`Failed to build concat list: ${err.message}`);
    }
  }

  const args = buildFFmpegArgs(opts, concatListFile);

  const proc = spawn(FFMPEG_BINARY, args, {
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    detached: false,
  });

  // Cleanup helper: close log handle + delete concat list file
  const cleanup = () => {
    logHandle.close().catch(() => {});
    if (concatListFile) {
      fs.unlink(concatListFile).catch(() => {});
    }
  };

  proc.on("error", (err) => {
    fs.appendFile(logFile, `\n[ERROR] ${err.message}\n`).catch(() => {});
    cleanup();
  });

  proc.on("exit", (code, signal) => {
    fs.appendFile(
      logFile,
      `\n[EXIT] code=${code} signal=${signal} at ${new Date().toISOString()}\n`
    ).catch(() => {});
    cleanup();
  });

  // If spawn failed synchronously (e.g., binary not found), proc.pid is undefined.
  // Close the log handle to prevent a file descriptor leak.
  if (!proc.pid) {
    cleanup();
    throw new Error("Failed to spawn FFmpeg process — is FFmpeg installed and in PATH?");
  }

  return { pid: proc.pid, logFile, process: proc };
}

// Stop an FFmpeg process by PID.
// Returns a Promise that resolves to true once the process has actually
// exited (or after a 3s timeout if it refuses to die). Previously this
// returned immediately after sending SIGTERM — callers would proceed to
// YouTube's "complete" transition while FFmpeg was still actively pushing
// video, causing YouTube to reject the transition and waste API quota
// on retries.
export async function stopFFmpegStream(pid: number): Promise<boolean> {
  try {
    // Check if the process is still alive before signaling
    if (!isProcessRunning(pid)) {
      return true;
    }

    process.kill(pid, "SIGTERM");

    // Wait for the process to actually exit, with a 3s timeout.
    // Poll every 100ms — cheap and responsive.
    const startTime = Date.now();
    const TIMEOUT_MS = 3000;
    while (Date.now() - startTime < TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!isProcessRunning(pid)) {
        return true;
      }
    }

    // Process is still alive after 3s — escalate to SIGKILL.
    // Re-check isProcessRunning first to avoid killing a PID that was
    // reused by another process between our last poll and now.
    if (isProcessRunning(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already dead — fine
      }
    }
    return true;
  } catch {
    // ESRCH = process doesn't exist; treat as success
    return false;
  }
}

// Check if a process is still running
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Read the tail of a stream log file
export async function readStreamLog(logFile: string, lines: number = 100): Promise<string> {
  try {
    const content = await fs.readFile(logFile, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "";
  }
}

// Detect FFmpeg and FFprobe paths
export async function detectFFmpeg(): Promise<{
  ffmpegPath: string;
  ffprobePath: string;
  version: string;
}> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(FFMPEG_BINARY, ["-version"], { timeout: 5000 });
    const versionLine = stdout.split("\n")[0];
    return {
      ffmpegPath: FFMPEG_BINARY,
      ffprobePath: FFPROBE_BINARY,
      version: versionLine,
    };
  } catch {
    return {
      ffmpegPath: FFMPEG_BINARY,
      ffprobePath: FFPROBE_BINARY,
      version: "Not detected",
    };
  }
}
