# ZephyrStream — Multi-Channel YouTube Live Streaming Platform

**v1.2.3** — A self-hosted automated live streaming scheduler for YouTube, built with Next.js 16, TypeScript, Prisma, and FFmpeg. Designed to be installed on a VPS and managed from any browser.

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

### 📁 File Management (Per-Channel Isolation)
- **Upload from PC** — drag-and-drop or click to browse (multi-file supported)
- **Import from Google Drive** — uses a connected channel's OAuth credentials
  - Browse folders, navigate subfolders, import individual files
  - Files are downloaded to your VPS for FFmpeg streaming
- Supported video formats: MP4, MOV, MKV, AVI, WebM, TS, FLV, M4V
- **Channel-scoped isolation** — files uploaded to Channel A do NOT appear in Channel B
  - Filter files by channel (All / Unassigned / specific channel)
  - Uploads automatically assigned to the selected channel
  - Google Drive imports automatically assigned to the browsing channel
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
- **YouTube broadcast transition retry** — retries up to 5 times with exponential backoff (5s, 10s, 20s, 40s, 80s) to handle YouTube processing delays

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

<<<<<<< HEAD
### 🖥️ Systemd Service for Production
- **Auto-start on VPS boot** — both main app (port 3000) and realtime service (port 3003)
- **Auto-restart on crash** — systemd `Restart=always` with 5-second delay
- One-command installer: `sudo bash deploy/install-services.sh`
- Service files included in `deploy/` directory
- Security hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`

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

### 📋 Stream Templates/Presets
- Save stream configuration as reusable templates
- Template stores: encoder, bitrate, resolution, fps, preset, privacy, category, tags, playlist ID, altered content, duration (min/max hours), spinner mode + emojis, autoCreateSchedule
- "New Stream from Template" — pre-fills the form with saved config
- Templates are per-user (not shared)
- API: `GET/POST /api/templates`, `DELETE /api/templates/[id]`

### 📊 Quota Usage Dashboard
- Tracks YouTube Data API v3 quota usage per day
- Estimates based on API call costs:
  - Broadcast create: ~100 units (insert + bind)
  - Broadcast update: ~50 units
  - Broadcast complete: ~50 units
  - Thumbnail upload: ~50 units
- Shows: used, remaining, usage %, events today
- Per-channel quota calculation (10,000 units × number of channels)
- API: `GET /api/quota`

### 🔲 Batch Operations
- Multi-select streams with checkboxes
- Bulk start, bulk stop, bulk delete
- Results show per-stream success/failure
- API: `POST /api/streams/batch` with `{ action, ids[] }`

---
=======
### 💾 Database Backup
- **Automatic daily backup** — runs via scheduler (throttled to once per 24h)
- Uses SQLite `.backup` command (safe online backup, no write locks)
- **7-day retention** — old backups auto-pruned
- Manual backup trigger from Settings page
- Download + delete backups from UI
- Backups stored in `backups/` directory
>>>>>>> 56fa230deb94cfd4b4724a5bb1d4c9fe05dcb1f4

### 🧹 Auto Cleanup
- Stream log files older than 7 days → auto-deleted
- SystemMetric records older than 24 hours → auto-pruned
- ActivityLog records older than 30 days → auto-pruned
- Temp files in `/tmp/` (zephystream-*) older than 24 hours → auto-deleted
- Orphaned FFmpeg concat list files → auto-deleted on process exit
- Runs every hour (throttled)

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

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Next.js 16 App (React 19 + TypeScript)             │    │
│  │  - Auth Form (signup/signin)                        │    │
│  │  - Dashboard (compact VPS stats, charts, activity)  │    │
│  │  - Channel Manager (multi-API, per-channel content) │    │
│  │  - Stream Manager (scheduling, FFmpeg, auto-create) │    │
│  │  - File Manager (PC + Google Drive, per-channel)    │    │
│  │  - Settings (update checker, backups, system info)  │    │
│  │  - TanStack Query for server state                  │    │
│  │  - Socket.io client for real-time updates           │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────┬───────────────────────────────┬──────────────────┘
           │ HTTPS                         │ WebSocket (port 3003)
┌──────────▼──────────────────┐  ┌────────▼──────────────────┐
│     VPS (Next.js server)    │  │  Realtime Service          │
│  ┌────────────────────────┐ │  │  (Socket.io mini-service)  │
│  │  API Routes            │ │  │  - Polls DB every 5s       │
│  │  - /api/auth/*         │ │  │  - Emits stream:status,    │
│  │  - /api/channels/*     │ │  │    activity:new events     │
│  │  - /api/streams/*      │ │  └───────────────────────────┘
│  │  - /api/files/*        │ │
│  │  - /api/system/*       │ │
│  │  - /api/dashboard      │ │
│  │  - /api/scheduler      │ │
│  └──────────┬─────────────┘ │
│             │               │
│  ┌──────────▼─────────────┐ │
│  │  Core Libraries        │ │
│  │  - auth.ts (bcrypt+JWT)│ │
│  │  - youtube.ts (API v3) │ │
│  │  - ffmpeg.ts (spawn)   │ │
│  │  - scheduler.ts (cron) │ │
│  │  - system-stats.ts     │ │
│  │  - gdrive.ts           │ │
│  │  - backup.ts           │ │
│  │  - cleanup.ts          │ │
│  └──────────┬─────────────┘ │
│             │               │
│  ┌──────────▼─────────────┐ │
│  │  Prisma ORM → SQLite   │ │
│  │  9 models: User,       │ │
│  │  Session, Channel,     │ │
│  │  Stream, UploadedFile, │ │
│  │  TitleItem,            │ │
│  │  ThumbnailItem,        │ │
│  │  SystemMetric,         │ │
│  │  ActivityLog           │ │
│  └────────────────────────┘ │
│                             │
│  ┌────────────────────────┐ │
│  │  FFmpeg Binary         │ │
│  │  (RTMP to YouTube)     │ │
│  └────────────────────────┘ │
└─────────────┬───────────────┘
              │ RTMP
              ▼
   ┌──────────────────────┐
   │  YouTube Live (RTMP) │
   │  a.rtmp.youtube.com  │
   └──────────────────────┘
```

### Why This Architecture Saves API Quota

| Operation | Uses YouTube API? | Quota Cost |
|-----------|-------------------|------------|
| **Live video streaming** | ❌ No (stream key + RTMP) | **0 units** |
| Create/Update broadcast | ✅ Yes | ~50 units |
| Transition to complete | ✅ Yes | ~50 units |
| Upload thumbnail | ✅ Yes | ~50 units |
| Token refresh | ❌ No (uses refresh token) | **0 units** |

A typical 4-hour stream costs **~150 API units** total. With 10,000 units/day per channel, you can run **60+ streams per day per channel** — and with multi-channel support, that multiplies accordingly.

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

Verify installation:
```bash
ffmpeg -version
ffprobe -version
```

### 1. Clone the Repository

```bash
git clone https://github.com/lailiaindah/ZephyrStream.git
cd ZephyrStream
```

### 2. Install Dependencies

```bash
# Using Bun (recommended — faster)
bun install

# Or using npm
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and **change the `JWT_SECRET`** to a long random string:

```bash
# Generate a secure secret
openssl rand -base64 64
```

```env
DATABASE_URL=file:/path/to/your/custom.db
JWT_SECRET=your-generated-secret-here
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

### 4. Initialize the Database

```bash
bun run db:push

# Or with npm
npx prisma db push
```

### 5. Start the App + Realtime Service

```bash
# Terminal 1: Main app (port 3000)
bun run dev

# Terminal 2: Realtime service (port 3003)
cd mini-services/realtime
bun install
bun run dev
```

Visit `http://localhost:3000` in your browser.

### 6. Production Build (for VPS deployment)

```bash
# Build the standalone production bundle
bun run build

# Start the production server
bun run start

# In a separate terminal, start the realtime service
cd mini-services/realtime
bun install
bun run dev
```

---

## 📖 Usage Guide

### Step 1: Create an Account

1. Open the app in your browser
2. Click **"Sign up"**
3. Enter your name, email, and password (min 8 chars, 1 letter, 1 number)
4. You'll be automatically signed in

### Step 2: Add a YouTube Channel

Each channel needs its own Google Cloud Console OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **YouTube Data API v3**
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth client ID**
6. Choose **Desktop app**
7. Copy the **Client ID** and **Client Secret**
8. In ZephyrStream, go to **Channels → Add Channel**
9. Enter a name, your Client ID, and Client Secret
10. Click **Create Channel** → authorization page opens
11. Sign in with your YouTube account, copy the authorization code
12. Paste it back in ZephyrStream and click **Connect Channel**

The app proactively refreshes access tokens — **no re-authorization needed** as long as the refresh token is valid.

### Step 3: Manage Channel Content

Click any channel card to open its detail view:
- **Stream Titles** — add titles (single or bulk paste), toggle on/off, shuffle
- **Thumbnails** — upload images, shuffle, delete
- **Video Files** — upload from PC, shuffle, delete

Titles and thumbnails are **picked at schedule creation time** — each new schedule gets the next title/thumbnail in the rotation.

### Step 4: Create a Live Stream Schedule

1. Go to **Streams → New Stream**
2. Fill in the **Basic** tab:
   - Stream name, description (with `[title]` variable buttons)
   - Select a connected channel
   - **YouTube Stream Key** (from YouTube Studio → Go live → Stream settings)
   - **Duration** — min/max hours (randomized at start)
   - **Schedule** — pick date & time for auto-start
   - **Auto Create Next Schedule** — toggle for daily auto-reschedule
   - Post-live replay status (Public / Unlisted / Random Unlisted)
   - Category, tags, playlist ID
   - Altered Content flag
3. Configure the **Source** tab — select uploaded files or local path
4. Configure the **FFmpeg** tab — encoder, resolution, bitrate, preset
5. (Optional) Configure the **Spinner** tab for anti-spam emoji variation
6. Click **Create Stream** — title & thumbnail are picked from the channel's rotator

### Step 5: Stream Lifecycle

```
Schedule created (title + thumbnail picked)
    ↓
Scheduler auto-starts at scheduled time
    → FFmpeg pushes video to YouTube via stream key
    → YouTube broadcast created/updated via API
    ↓
Stream is LIVE
    → Real-time WebSocket updates push to browser
    → Auto-stop when max duration reached
    ↓
Stream ends (manual stop, auto-stop, or FFmpeg crash)
    → YouTube broadcast transitioned to "complete" (with retry)
    → If autoCreateSchedule: next-day schedule created (startAt + 24h)
    → If manual stop: user chooses "Stop & Reschedule" or "Stop Only"
    ↓
Next day: cycle repeats
```

---

## 🛠️ Development

### Available Scripts

```bash
bun run dev          # Start dev server (port 3000)
bun run build        # Production build
bun run start        # Start production server
bun run lint         # Run ESLint
bun run db:push      # Push Prisma schema to database
bun run db:generate  # Regenerate Prisma Client
```

### Project Structure

```
ZephyrStream/
├── prisma/
│   └── schema.prisma              # Database schema (9 models)
├── mini-services/
│   └── realtime/                  # Socket.io real-time service (port 3003)
├── public/
│   ├── uploads/                   # User-uploaded video files (per-channel)
│   └── logo.svg                   # App logo
├── src/
│   ├── app/
│   │   ├── api/                   # API routes
│   │   │   ├── auth/              # signup, signin, signout, me
│   │   │   ├── channels/          # CRUD + OAuth + exchange-code
│   │   │   ├── streams/           # CRUD + start/stop/log + duplicate
│   │   │   ├── files/             # upload + google-drive + shuffle
│   │   │   ├── titles/            # CRUD + bulk + shuffle + delete-all
│   │   │   ├── thumbnails/        # CRUD + shuffle + delete-all + serve
│   │   │   ├── system/            # stats + time + cleanup + ffmpeg + update + backup
│   │   │   ├── scheduler/         # Start/status scheduler
│   │   │   ├── dashboard/         # Aggregated summary
│   │   │   └── activity-logs/     # Activity history
│   │   ├── globals.css            # Theme (elegant black)
│   │   ├── layout.tsx             # Root layout + providers + scheduler bootstrap
│   │   └── page.tsx               # Main SPA entry
│   ├── components/
│   │   ├── auth/                  # AuthForm
│   │   ├── layout/                # Sidebar, Header, MobileNav, ServerClock
│   │   ├── dashboard/             # StatsCards, MetricChart, ActivityFeed, etc.
│   │   ├── channels/              # ChannelList, ChannelForm, TitleManager, ThumbnailManager
│   │   ├── streams/               # StreamList, StreamForm
│   │   ├── files/                 # FileManager
│   │   ├── common/                # Logo, StatusBadge
│   │   ├── providers.tsx          # QueryClientProvider
│   │   └── ui/                    # shadcn/ui components
│   ├── hooks/
│   │   ├── use-realtime.ts        # Socket.io client hook
│   │   ├── use-toast.ts           # Toast notifications
│   │   └── use-mobile.ts          # Mobile detection
│   └── lib/
│       ├── auth.ts                # JWT + bcrypt
│       ├── backup.ts              # Database backup service
│       ├── cleanup.ts             # Auto cleanup service
│       ├── constants.ts           # App constants, version, catalogs
│       ├── db.ts                  # Prisma client
│       ├── ffmpeg.ts              # FFmpeg spawn + concat + probe
│       ├── gdrive.ts              # Google Drive API
│       ├── scheduler.ts           # Auto-start/stop/restart/refresh + node-cron
│       ├── system-stats.ts        # VPS monitoring (CPU, RAM, Disk, Network)
│       ├── youtube.ts             # YouTube Data API v3 + rotator + retry
│       └── utils.ts               # cn() helper
├── backups/                       # Auto database backups (7-day retention)
├── logs/streams/                  # FFmpeg stream logs (7-day retention)
├── .env.example                   # Environment template
├── package.json
└── README.md                      # This file
```

### Database Schema (9 models)

- **User** — email, passwordHash, name, role
- **Session** — JWT token tracking
- **Channel** — YouTube channel with OAuth credentials + rotator indexes
- **Stream** — Live stream config + resolved title/thumbnail + retryCount
- **UploadedFile** — Video files (per-channel, local or Google Drive)
- **TitleItem** — Per-channel title list with sortOrder + enabled flag
- **ThumbnailItem** — Per-channel thumbnail images with sortOrder
- **SystemMetric** — Historical VPS metrics (24h retention)
- **ActivityLog** — Audit trail (30-day retention)

---

## 🔒 Security Notes

- **Passwords** hashed with bcrypt (12 salt rounds)
- **JWT tokens** signed with `JWT_SECRET`, stored in HttpOnly cookies
- **Cookies** secure (HTTPS-only in production), `sameSite: lax`
- **OAuth credentials** stored in database (consider encrypting at rest for production)
- **File uploads** sanitized (filename characters restricted)
- **Per-user data isolation** — every query scoped to authenticated user
- **Backup filename validation** — regex prevents directory traversal

---

## ❓ Troubleshooting

### FFmpeg not detected
- Verify: `ffmpeg -version`
- Set `FFMPEG_PATH` and `FFPROBE_PATH` in `.env` if not in PATH

### Google OAuth fails
- Ensure YouTube Data API v3 is enabled in Google Cloud Console
- Redirect URI: `urn:ietf:wg:oauth:2.0:oob` (Desktop app)
- Token refresh is automatic — no re-authorization needed

### Stream won't start
- Check FFmpeg is installed
- Verify YouTube stream key is valid
- Check stream log (click **Log** in Streams list)
- Ensure source video files exist

### Realtime not connecting
- Ensure realtime service is running on port 3003
- Check browser console for connection errors
- App falls back to direct connection if gateway fails

### Database backup fails
- Ensure `sqlite3` CLI is installed (falls back to file copy)
- Check `backups/` directory is writable

---

## 📄 License

Personal use. Inspired by the original Zephyr Streamer desktop app (PyQt6), reimplemented from scratch as a web application with new features and design.

---

## 🙏 Acknowledgments

- Original *Zephyr Streamer* — desktop app that inspired this project
- [Next.js](https://nextjs.org/) — React framework
- [Prisma](https://prisma.io/) — Database ORM
- [shadcn/ui](https://ui.shadcn.com/) — UI components
- [TanStack Query](https://tanstack.com/query) — Server state
- [Socket.io](https://socket.io/) — Real-time updates
- [node-cron](https://github.com/node-cron/node-cron) — Persistent scheduler
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) — YouTube + Drive API
- [systeminformation](https://github.com/sebhildebrandt/systeminformation) — VPS metrics
- [FFmpeg](https://ffmpeg.org/) — Video streaming

---

## 📞 Support

For issues, feature requests, or questions, please open an issue on [GitHub](https://github.com/lailiaindah/ZephyrStream/issues).

---

<<<<<<< HEAD
**ZephyrStream v1.3.0** — Built with ❤️ for the streaming community.
=======
**ZephyrStream v1.2.3** — Built with ❤️ for the streaming community.
>>>>>>> 56fa230deb94cfd4b4724a5bb1d4c9fe05dcb1f4
