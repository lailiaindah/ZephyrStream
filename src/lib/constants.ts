// ZephyrStream constants — shared across the app

export const APP_NAME = "ZephyrStream";
export const APP_VERSION = "1.2.2";
export const APP_TAGLINE = "Multi-Channel YouTube Live Streaming Platform";

// Media file extensions supported by the platform
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".ts", ".flv", ".m4v"];
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif"];
export const THUMBNAIL_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];

// YouTube category list (id -> name)
export const YOUTUBE_CATEGORIES: Record<string, string> = {
  "1": "Film & Animation",
  "2": "Autos & Vehicles",
  "10": "Music",
  "15": "Pets & Animals",
  "17": "Sports",
  "20": "Gaming",
  "22": "People & Blogs",
  "23": "Comedy",
  "24": "Entertainment",
  "25": "News & Politics",
  "26": "Howto & Style",
  "27": "Education",
  "28": "Science & Technology",
  "29": "Nonprofits & Activism",
};

export const DEFAULT_CATEGORY_ID = "22";

// YouTube encoder choices for FFmpeg
export const ENCODER_CHOICES = [
  { value: "auto", label: "Auto (best available)" },
  { value: "x264", label: "x264 (CPU)" },
  { value: "nvenc", label: "NVIDIA NVENC (GPU)" },
  { value: "qsv", label: "Intel QuickSync" },
  { value: "amf", label: "AMD AMF" },
  { value: "videotoolbox", label: "Apple VideoToolbox" },
];

// Stream status colors
export const STREAM_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: "text-slate-300", bg: "bg-slate-700/40 border-slate-600" },
  preparing: { label: "Preparing", color: "text-amber-300", bg: "bg-amber-900/30 border-amber-700" },
  live: { label: "Live", color: "text-red-300", bg: "bg-red-900/40 border-red-700" },
  stopping: { label: "Stopping", color: "text-orange-300", bg: "bg-orange-900/30 border-orange-700" },
  ended: { label: "Ended", color: "text-slate-400", bg: "bg-slate-800/40 border-slate-700" },
  error: { label: "Error", color: "text-rose-300", bg: "bg-rose-900/40 border-rose-700" },
};

export const CHANNEL_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Connected", color: "text-emerald-300", bg: "bg-emerald-900/30 border-emerald-700" },
  inactive: { label: "Inactive", color: "text-slate-300", bg: "bg-slate-700/40 border-slate-600" },
  error: { label: "Error", color: "text-rose-300", bg: "bg-rose-900/40 border-rose-700" },
};

// Privacy options — these represent POST-LIVE replay status
// (live broadcast itself is always public; this controls the replay visibility)
export const PRIVACY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "random_unlisted", label: "Random Unlisted" },
];

// Encoder preset choices — re-used in the stream form
export const PRESET_CHOICES = [
  { value: "ultrafast", label: "Ultrafast (lowest CPU)" },
  { value: "superfast", label: "Superfast" },
  { value: "veryfast", label: "Veryfast (recommended)" },
  { value: "faster", label: "Faster" },
  { value: "fast", label: "Fast" },
  { value: "medium", label: "Medium (balanced)" },
  { value: "slow", label: "Slow (high quality)" },
];

// Spinner modes for title anti-spam
export const SPINNER_MODES = [
  { value: "off", label: "Off" },
  { value: "front", label: "Emoji in front" },
  { value: "back", label: "Emoji at back" },
  { value: "both", label: "Both sides" },
];

// Curated emoji catalog for the spinner
export const EMOJI_CATALOG: Record<string, string[]> = {
  Music: ["🎵", "🎶", "🎤", "🎧", "🎸", "🎹", "🥁", "🎷", "🎺", "🎻", "🔊", "💿", "🎚️", "📻", "🎼"],
  Film: ["🎬", "🎭", "🎥", "📹", "📺", "🎞️", "📽️", "📷", "📸", "🍿", "🎫", "🌟", "⭐", "🏆", "🥇"],
  Faces: ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "😘", "😋", "🤔", "🤗", "🥳", "😴", "🤯", "😱", "😭", "😡", "🥺", "😇", "🤠", "🤡", "👻", "💀", "👽"],
  Symbols: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨", "🌟", "⭐", "🔥", "💥", "⚡", "💯", "✅", "❌", "⭕", "🔴", "🟢"],
  Gaming: ["🎮", "🕹️", "👾", "🎯", "🎲", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥅"],
  Nature: ["🌸", "🌺", "🌻", "🌷", "🌹", "🍀", "🌿", "🍃", "🍂", "🍁", "🌴", "🌵", "🌊", "⛰️", "🏔️", "🌋", "🏝️", "🏖️", "🌅", "🌄"],
  Food: ["🍕", "🍔", "🍟", "🌭", "🍿", "🥨", "🥯", "🧇", "🥞", "🍰", "🎂", "🍪", "🍩", "🍫", "🍬", "🍭", "☕", "🍵", "🥤", "🍺"],
  Travel: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "✈️", "🚀", "🛸", "🚁", "⛵", "🚤", "🚲", "🏍️"],
  Flags: ["🏁", "🚩", "🎌", "🏳️", "🏴", "🌈", "🇮🇩", "🇺🇸", "🇬🇧", "🇯🇵", "🇰🇷", "🇨🇳", "🇮🇳", "🇧🇷", "🇫🇷", "🇩🇪", "🇪🇸", "🇮🇹", "🇨🇦", "🇦🇺"],
};

// Description template variables
export const TEMPLATE_VARIABLES = [
  { token: "[title]", description: "Stream title" },
  { token: "[date]", description: "Date (YYYY-MM-DD)" },
  { token: "[time]", description: "Time (HH:MM)" },
  { token: "[datetime]", description: "Date and time" },
  { token: "[video_number]", description: "Per-stream-key video number" },
  { token: "[counter]", description: "Global counter" },
];

// Session configuration
export const SESSION_COOKIE_NAME = "zephyr_session";
export const SESSION_EXPIRY_DAYS = 7;

// File paths
export const UPLOAD_DIR = "/home/z/my-project/public/uploads";
export const STREAM_LOG_DIR = "/home/z/my-project/logs/streams";
export const FFMPEG_BINARY = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_BINARY = process.env.FFPROBE_PATH || "ffprobe";

// YouTube RTMP endpoint
export const YOUTUBE_RTMP_BASE = "rtmp://a.rtmp.youtube.com/live2";

// Google OAuth scopes
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/drive.readonly",
];
