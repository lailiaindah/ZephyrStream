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

// Build the FFmpeg command arguments for streaming
function buildFFmpegArgs(opts: FFmpegOptions): string[] {
  const { videoCodec } = resolveEncoder(opts.encoder);
  const rtmpEndpoint = opts.rtmpUrl.endsWith("/")
    ? `${opts.rtmpUrl}${opts.streamKey}`
    : `${opts.rtmpUrl}/${opts.streamKey}`;

  const args: string[] = ["-hide_banner", "-loglevel", "info"];

  // Re-encode mode: normalize everything for stable playback
  if (!opts.copyMode) {
    args.push(
      "-re", // Read input at native frame rate
      "-stream_loop", "-1", // Loop the input indefinitely
      "-i", opts.videoFiles[0],
      "-c:v", videoCodec,
      "-preset", opts.preset,
      "-b:v", opts.videoBitrate,
      "-maxrate", opts.videoBitrate,
      "-bufsize", `${parseInt(opts.videoBitrate) * 2}k`,
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
      "-re",
      "-stream_loop", "-1",
      "-i", opts.videoFiles[0],
      "-c", "copy",
      "-f", "flv",
      rtmpEndpoint
    );
  }

  // Duration limit: place -t AFTER the input file so it acts as an
  // output option (caps the total stream duration). Placing it before
  // -i as an input option can interact poorly with -stream_loop -1.
  if (opts.durationSeconds) {
    const inputFileIndex = args.indexOf("-i") + 2; // skip "-i" and the filename
    args.splice(inputFileIndex, 0, "-t", opts.durationSeconds.toString());
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

  // Use timestamp only for the log file name — the FFmpeg PID isn't
  // known until after spawn, and process.pid here refers to the Next.js
  // process, not FFmpeg. The logFile path is stored in the DB anyway.
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(STREAM_LOG_DIR, `stream_${timestamp}.log`);
  const logHandle = await fs.open(logFile, "w");

  const args = buildFFmpegArgs(opts);

  const proc = spawn(FFMPEG_BINARY, args, {
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    detached: false,
  });

  proc.on("error", (err) => {
    fs.appendFile(logFile, `\n[ERROR] ${err.message}\n`).catch(() => {});
  });

  proc.on("exit", (code, signal) => {
    fs.appendFile(
      logFile,
      `\n[EXIT] code=${code} signal=${signal} at ${new Date().toISOString()}\n`
    ).catch(() => {});
    logHandle.close().catch(() => {});
  });

  if (!proc.pid) {
    throw new Error("Failed to spawn FFmpeg process");
  }

  return { pid: proc.pid, logFile, process: proc };
}

// Stop an FFmpeg process by PID
export async function stopFFmpegStream(pid: number): Promise<boolean> {
  try {
    process.kill(pid, "SIGTERM");
    // Wait 2 seconds, then SIGKILL if still alive
    setTimeout(() => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already dead
      }
    }, 2000);
    return true;
  } catch {
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
