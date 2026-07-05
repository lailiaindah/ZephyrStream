# ZephyrStream — Multi-Channel YouTube Live Streaming Platform

**v1.5.1** — A self-hosted automated live streaming scheduler for YouTube, built with Next.js 16, TypeScript, Prisma, and FFmpeg. Designed to be installed on a VPS and managed from any browser.

> **Inspired by** the original *Zephyr Streamer* desktop app (PyQt6 + FFmpeg), this is a complete web reimplementation with a fresh design, new architecture, and many new features — built from scratch as a brand-new application.

---

## ✨ Key Features

### 🔐 Authentication
- **Sign up / Sign in** with email + password (JWT-based sessions in HttpOnly cookies)
- Password hashing with bcrypt (12 rounds)
- Session expiry: 7 days
- Per-user data isolation — every channel, stream, and file belongs to a user

### ⏰ Automated Scheduling System
- **Auto-start** — streams automatically start at their scheduled date/time
- **Auto-stop** — streams automatically stop when max duration is reached
- **Auto-create next-day schedule** — when a stream ends or errors, a new schedule is automatically created for the next day (startAt + 24h) with the same stream key
- **Date/time picker** — schedule streams for specific dates and times
- **Persistent scheduler** — uses node-cron (survives event loop delays, re-syncs to wall clock)
- **Race condition guards** — prevents double-start, double-stop, and infinite schedule loops
- **Stop options** — manual stop gives choice: "Stop & Reschedule" or "Stop Only (No Reschedule)"

### 🔄 Auto-Restart FFmpeg
- If FFmpeg crashes mid-stream, the scheduler automatically retries up to **3 times** with exponential backoff (5s, 10s, 20s)
- Retry count persisted in database (reset on each successful start)
- Activity logs for each retry attempt
- If all retries fail → marks stream as ended + creates next-day schedule

### 📡 Real-Time Updates (WebSocket)
- Socket.io mini-service on port 3003
- Push notifications when stream status changes (live / ended / error)
- Auto-refresh dashboard, streams list, and notifications
- Real-time activity log feed
- Connection status indicator in footer ("Realtime Connected" / "Realtime Offline")
- Auto-fallback to direct connection if gateway fails

### 🔄 Auto-Recovery on Server Restart
- When VPS/server restarts, FFmpeg processes are killed but DB still shows "live"
- Scheduler runs auto-recovery on startup:
  - "live" streams with dead PID → marked as "ended" or "error"
  - "preparing" streams → reset to "scheduled"
  - "stopping" streams → marked as "ended"
- If stream ran >1 minute before restart → marked as "ended" (clean)
- If stream ran <1 minute → marked as "error" (with retry logic)
- Auto-creates next-day schedule if `autoCreateSchedule` is on
- Activity logs all recovery actions

### 📊 VPS Monitoring (Real-time)
Live monitoring of your VPS resources, refreshed every 5 seconds:
- **CPU** — usage %, cores, manufacturer, brand, temperature, load average (1/5/15 min)
- **RAM** — total, used, free, usage %
- **Disk** — per-mount usage, free space
- **Network** — real-time download/upload speed in Mbps, total transferred
- **Uptime** — server uptime (days/hours/minutes)
- **OS info** — distro, kernel, hostname, platform
- Historical charts (last 60 minutes, stored in SQLite)
- **Internet speed test** — downloads a test file from Cloudflare to measure actual throughput
- Compact icon-grid dashboard — click any tile for detailed info modal

### 📊 Quota Usage Dashboard
- Tracks YouTube Data API v3 quota usage per day
- Color-coded progress bar (green / amber / red)
- Shows: used, remaining, usage %, events today, channels count, total quota
- Auto-refreshes every 30 seconds

### 📁 File Management (Per-Channel Isolation)
- **Upload from PC** — drag-and-drop or click to browse (multi-file supported)
- **Import from Google Drive** — uses a connected channel's OAuth credentials
  - Browse folders, navigate subfolders, import individual files
  - Files are downloaded to your VPS via streaming (no size limit)
  - Files automatically assigned to the browsing channel
- Supported video formats: MP4, MOV, MKV, AVI, WebM, TS, FLV, M4V
- **Channel-scoped isolation** — files uploaded to Channel A do NOT appear in Channel B
  - Filter files by channel (All / Unassigned / specific channel)
  - Uploads automatically assigned to the selected channel
- **Delete options**: single file delete + delete all files for a channel
- Files stored in `public/uploads/channels/{channelId}/` for filesystem isolation
- **Shuffle** — randomize video playback order for each stream

### 📺 Multi-Channel Management
Each channel uses its own **Google Cloud Console credentials** (clientId + clientSecret):
- Add unlimited YouTube channels — each with separate API quota
- OAuth 2.0 flow with **proactive token refresh** (refreshes before expiry, no re-authorization needed)
- **Refresh token rotation** — persists new refresh tokens if Google rotates them
- Channel status tracking (active / inactive / error)
- Per-channel counters (streams / files / titles / thumbnails)
- **Channel detail view** — click any channel card to manage its titles, thumbnails, and files
- **No sync button** — channel info is fetched once on connect (saves API quota)

### 📝 Stream Titles (Per-Channel Rotator)
Each channel has its own independent list of stream titles:
- Add titles one-by-one or **bulk paste** (one title per line)
- Toggle individual titles on/off
- Titles are **picked at schedule creation time** (not at stream start)
- Rotator index persisted — each new schedule gets the next title in rotation
- **Shuffle** — randomize title order + reset rotator index
- Spinner emoji applied to titles (4 modes: Off / Front / Back / Both)
- **Delete single** title or **delete all** titles for a channel

### 🖼️ Thumbnails (Per-Channel Gallery)
Each channel has its own thumbnail collection:
- Upload multiple images at once (JPG, PNG, WebP, BMP)
- Visual gallery preview with file size
- Thumbnails are **picked at schedule creation time** and uploaded to YouTube
- Rotator index persisted — each new schedule gets the next thumbnail
- **Shuffle** — randomize thumbnail order + reset rotator index
- **Delete single** thumbnail (hover overlay) or **delete all** thumbnails
- Stored in `public/uploads/thumbnails/{channelId}/`

### 🎥 Live Streaming (Stream-Key Based — Saves API Quota)
- **Live video streaming uses the YouTube stream key + FFmpeg RTMP** — NOT the API
  - Streaming itself consumes **zero API quota**
  - API only used to create/update broadcast and transition status
- **Multi-file concat** — play multiple video files in sequence (FFmpeg concat demuxer)
- **Create or Update** — editing a schedule updates the existing YouTube live event (no duplicates)
- **Multi-encoder support**: Auto / x264 (CPU) / NVENC / QuickSync / AMF / VideoToolbox
- **Copy mode** — stream without re-encoding (when all videos share specs)
- **Re-encode mode** — normalize resolution, FPS, bitrate, keyframe cadence
- Configurable: video bitrate, audio bitrate, resolution (up to 4K), FPS (24/30/60), preset
- **Duration** — randomized between min and max hours
- **Post-live replay status** — Public / Unlisted / Random Unlisted (live is always public)
- **Altered Content** flag (YouTube policy)
- **YouTube Playlist ID** — add broadcast to a playlist
- Real-time stream status (scheduled / preparing / live / stopping / ended / error)
- Live FFmpeg log viewer (auto-refreshing)
- **Copy/Duplicate stream** — clone a schedule with fresh title/thumbnail pick
- **YouTube broadcast transition retry** — retries up to 5 times with exponential backoff (5s, 10s, 20s, 40s, 80s)

### 📋 Stream Templates/Presets
- Save stream configuration as reusable templates
- Template stores: encoder, bitrate, resolution, fps, preset, privacy, category, tags, playlist ID, altered content, duration (min/max hours), spinner mode + emojis, autoCreateSchedule
- "Load from template" dropdown in Stream Form — pre-fills all config
- "Save as Template" button — saves current form config
- Templates are per-user (not shared)

### 🔲 Batch Operations
- Multi-select streams with checkboxes
- Bulk start, bulk stop, bulk delete
- "Select All" checkbox + per-stream checkboxes
- Selected cards get cyan border highlight
- Results show per-stream success/failure

### 🎨 Description Template Variables
- Insert `[title]`, `[date]`, `[time]`, `[datetime]` into stream description with one click
- `[title]` is replaced with the picked title from the channel's rotator list

### 🔔 Header Features
- **Server clock** — displays VPS server date & time (not client browser time)
- **Search** — global search across channels, streams, and files
- **Notifications** — recent activity feed popover
- **Profile dropdown** — quick access to Settings, Activity Log, Sign out

### 📋 Activity Log
- Tracks all user + system actions: auth, channel, stream, file operations
- Color-coded by level (info / success / warning / error)
- Auto-pruned after 30 days

### 💾 Database Backup
- **Automatic daily backup** — runs via scheduler (throttled to once per 24h)
- Uses SQLite `.backup` command (safe online backup, no write locks)
- **7-day retention** — old backups auto-pruned
- Manual backup trigger from Settings page
- Download + delete backups from UI
- Backups stored in `backups/` directory

### 🧹 Auto Cleanup
- Stream log files older than 7 days → auto-deleted
- SystemMetric records older than 24 hours → auto-pruned
- ActivityLog records older than 30 days → auto-pruned
- Temp files in `/tmp/` (zephystream-*) older than 24 hours → auto-deleted
- Orphaned FFmpeg concat list files → auto-deleted on process exit
- Runs every hour (throttled)

### 🖥️ Systemd Service for Production
- **Auto-start on VPS boot** — both main app (port 3000) and realtime service (port 3003)
- **Auto-restart on crash** — systemd `Restart=always` with 5-second delay
- One-command installer: `sudo bash deploy/install-services.sh`
- Service files included in `deploy/` directory
- Security hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`

### 🔄 Update Checker
- **"Cek Update" button** in Settings — checks GitHub for new commits
- Shows list of new commits before pulling
- **One-click update** — runs `git pull` directly from the browser
- Detects if `bun install` or `bun run db:push` is needed after pull
- Displays current version + commit hash

### 🎨 Design
- **Elegant black theme** — deep graphite backgrounds with electric cyan + emerald accents
- Subtle radial gradients and grid patterns
- Custom glow effects, pulse animations, shimmer loading states
- Fully responsive (mobile sidebar, touch-friendly targets)
- Built with shadcn/ui component library + Tailwind CSS 4

---

## 🚀 Installation

### Prerequisites

- **Node.js 18+** (or Bun — recommended)
- **FFmpeg** installed on your VPS
- **SQLite** (bundled — no separate install needed)

#### Install FFmpeg

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg

# CentOS / RHEL / Fedora
sudo dnf install -y ffmpeg

# macOS
brew install ffmpeg
```

### 1. Clone the Repository

```bash
git clone https://github.com/lailiaindah/ZephyrStream.git
cd ZephyrStream
```

### 2. Install Dependencies

```bash
# Main app
bun install

# Realtime service
cd mini-services/realtime
bun install
cd ../..
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Use ABSOLUTE path to your project folder (case-sensitive!)
DATABASE_URL=file:/home/ubuntu/ZephyrStream/db/custom.db

# Generate secret: openssl rand -hex 32
JWT_SECRET=your_generated_secret_here

# FFmpeg paths (leave default if in PATH)
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe

# Set to production for VPS
NODE_ENV=production

# Only set HTTPS=true if using domain + SSL reverse proxy
# Leave commented for http://IP-VPS:3000 access
# HTTPS=true
```

> **⚠️ Important for HTTP access (no domain):**
> If accessing via `http://IP-VPS:3000` (no HTTPS), do NOT set `HTTPS=true`.
> The app automatically uses non-secure cookies for HTTP access.
> Only enable `HTTPS=true` when you have a domain + SSL certificate.

### 4. Initialize the Database

```bash
bun run db:push
```

### 5. Run Development

```bash
# Terminal 1: Main app (port 3000)
bun run dev

# Terminal 2: Realtime service (port 3003)
cd mini-services/realtime
bun run dev
```

### 6. Production Build & Deploy

```bash
# Build
bun run build

# Start main app
bun run start

# Terminal 2: Start realtime service
cd mini-services/realtime
bun run dev
```

### 7. Systemd Service (Auto-Start on Boot)

```bash
# One-command setup
sudo bash deploy/install-services.sh

# Commands:
sudo systemctl status zephystream
sudo systemctl restart zephystream
sudo journalctl -u zephystream -f
```

### Access the App

- **Development:** `http://IP-VPS:3000`
- **Production (with domain):** `https://your-domain.com` (use Nginx/Caddy reverse proxy)

> **Note:** You do NOT need a domain. You can access via `http://IP-VPS:3000` directly.

---

## 📖 Usage Guide

### Step 1: Create an Account

1. Open the app in your browser
2. Click **"Sign up"**
3. Enter name, email, password (min 8 chars, 1 letter, 1 number)

### Step 2: Add a YouTube Channel

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable **YouTube Data API v3**
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Choose **Web application**
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/channels/oauth-callback
   ```
   > Google allows `http://localhost` as redirect URI — no domain needed!
6. Copy **Client ID** and **Client Secret**
7. In ZephyrStream: **Channels → Add Channel** → enter name, Client ID, Client Secret
8. Click **Create Channel** → click **Open Google Authorization**
9. A popup window opens → sign in with YouTube account → Google redirects back
10. Popup closes automatically → channel connected!

> **Note:** Google blocked the old OOB (out-of-band) flow. We now use
> `http://localhost:3000/api/channels/oauth-callback` as the redirect URI.
> The popup window handles the callback and sends the result back to the
> main window via `postMessage`. No domain or HTTPS required.

Tokens are auto-refreshed — no re-authorization needed.

### Step 3: Manage Channel Content

Click any channel card to open detail view:
- **Stream Titles** — add (single/bulk), toggle, shuffle, delete
- **Thumbnails** — upload images (from PC), shuffle, delete
- **Video Files** — upload from PC or Google Drive, shuffle, delete

Titles and thumbnails are **picked at schedule creation time**.

### Step 4: Create a Live Stream Schedule

1. **Streams → New Stream**
2. **Basic tab:** name, description, channel, stream key, duration (hours), schedule date/time, auto-create schedule, privacy, category, tags, playlist ID, altered content
3. **Source tab:** select uploaded files or local path
4. **FFmpeg tab:** encoder, resolution, bitrate, preset
5. **Spinner tab:** anti-spam emoji variation
6. (Optional) **Load from template** to pre-fill config
7. Click **Create Stream**

### Step 5: Stream Lifecycle

```
Schedule created (title + thumbnail picked from rotator)
    ↓
Scheduler auto-starts at scheduled time
    → FFmpeg pushes video to YouTube via stream key (0 API quota)
    → YouTube broadcast created/updated via API
    ↓
Stream is LIVE (real-time WebSocket updates to browser)
    → Auto-stop when max duration reached
    ↓
Stream ends (manual stop, auto-stop, or FFmpeg crash)
    → YouTube broadcast transitioned to "complete" (5x retry with backoff)
    → Auto-restart FFmpeg if crashed (3x retry)
    → If autoCreateSchedule: next-day schedule created (startAt + 24h)
    → Manual stop: choose "Stop & Reschedule" or "Stop Only"
    ↓
Next day: cycle repeats
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
│  Next.js 16 (React 19 + TypeScript)                         │
│  - Dashboard / Channels / Streams / Files / Settings        │
│  - Socket.io client for real-time updates                   │
│  - TanStack Query for server state                          │
└──────────┬───────────────────────────────┬──────────────────┘
           │ HTTP                          │ WebSocket
┌──────────▼──────────────────┐  ┌────────▼──────────────────┐
│     VPS (Next.js :3000)     │  │  Realtime Service (:3003)  │
│  API Routes + Scheduler     │  │  Socket.io — polls DB 5s   │
│  - auth, channels, streams  │  │  Emits: stream:status,     │
│  - files, system, backup    │  │  activity:new, errors      │
│  - templates, quota, batch  │  └───────────────────────────┘
│  Core: youtube.ts, ffmpeg   │
│  scheduler.ts, backup.ts    │
│  cleanup.ts, system-stats   │
│  Prisma → SQLite (10 models)│
│  FFmpeg (RTMP to YouTube)   │
└─────────────┬───────────────┘
              │ RTMP (stream key, 0 API quota)
              ▼
   ┌──────────────────────┐
   │  YouTube Live (RTMP) │
   └──────────────────────┘
```

### API Quota Savings

| Operation | YouTube API? | Cost |
|-----------|-------------|------|
| **Live streaming** | ❌ No (stream key) | **0 units** |
| Create/Update broadcast | ✅ Yes | ~100 units |
| Transition to complete | ✅ Yes | ~50 units |
| Token refresh | ❌ No | **0 units** |

~150 units per stream. 10,000/day per channel = **60+ streams/day/channel**.

---

## 🛠️ Development

```bash
bun run dev          # Dev server (port 3000)
bun run build        # Production build
bun run start        # Production server
bun run lint         # ESLint
bun run db:push      # Push Prisma schema
bun run db:generate  # Regenerate Prisma Client
```

### Project Structure

```
ZephyrStream/
├── deploy/                        # Systemd service files + installer
├── mini-services/realtime/        # Socket.io service (port 3003)
├── prisma/schema.prisma           # 10 models
├── src/
│   ├── app/api/                   # 25+ API routes
│   ├── components/                # UI components
│   ├── hooks/                     # use-realtime, use-toast
│   └── lib/                       # auth, youtube, ffmpeg, scheduler, backup, cleanup
├── backups/                       # Auto DB backups (7-day retention)
├── .env.example
└── package.json
```

### Database Schema (10 models)

User, Session, Channel, Stream, UploadedFile, TitleItem, ThumbnailItem, SystemMetric, ActivityLog, StreamTemplate

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| **Build fails** | `NODE_ENV=production bun run build` (v1.3.1+ does this automatically) |
| **`cd mini-services/realtime: No such file`** | Fixed in v1.3.1 — `git pull` to get latest |
| **Google OAuth error (OOB blocked)** | Fixed in v1.4.0+ — use Web application type, redirect URI: `http://localhost:3000/api/channels/oauth-callback` |
| **Thumbnail upload error (EROFS)** | Fixed in v1.4.3+ — paths now dynamic |
| **Google Drive not working** | Fixed in v1.4.3+ — Drive scope added to OAuth |
| **Dashboard shows "Unauthorized"** | Fixed in v1.3.3+ — cookie secure flag now conditional on HTTPS env var |
| **Speed test / Backup / Update fails** | All require login — check if session cookie is set |
| **FFmpeg not found** | `sudo apt install ffmpeg` or set `FFMPEG_PATH` in `.env` |
| **Google OAuth fails** | Use Web application type, redirect URI: `http://localhost:3000/api/channels/oauth-callback`. See Step 2 in Usage Guide. |
| **Realtime not connecting** | Start realtime service: `cd mini-services/realtime && bun install && bun run dev` |
| **Database error** | `mkdir -p db && bun run db:push` |
| **Stream won't start** | Check FFmpeg installed, stream key valid, video files exist |
| **Can't access from browser** | Open port 3000 + 3003 in firewall, use `http://IP-VPS:3000` |

---

## 📄 License

Personal use. Inspired by the original Zephyr Streamer (PyQt6), reimplemented from scratch.

---

**ZephyrStream v1.5.1** — Built with ❤️ for the streaming community.
