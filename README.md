# ZephyrStream — Multi-Channel YouTube Live Streaming Platform

A self-hosted **web-based** live streaming management platform for YouTube, built with Next.js 16, TypeScript, Prisma, and FFmpeg. Designed to be installed on a VPS and managed from any browser.

> **Inspired by** the original *Zephyr Streamer* desktop app (PyQt6 + FFmpeg), this is a complete web reimplementation with a fresh design, new architecture, and several new features — built from scratch as a brand-new application.

---

## ✨ Key Features

### 🔐 Authentication
- **Sign up / Sign in** with email + password (JWT-based sessions stored in HttpOnly cookies)
- Password hashing with bcrypt (12 rounds)
- Session expiry: 7 days
- Per-user data isolation — every channel, stream, and file belongs to a user

### 📊 VPS Monitoring (Real-time)
Live monitoring of your VPS resources, refreshed every 5 seconds:
- **CPU usage** (per-core + total, manufacturer, brand, temperature)
- **RAM** (total, used, free, percentage)
- **Disk** (per-mount usage, free space)
- **Network** (download/upload speed in Mbps, total transferred)
- **Uptime** + OS info (distro, kernel, hostname)
- Historical charts (last 60 minutes, stored in SQLite)
- **Internet speed test** — downloads a test file from Cloudflare to measure actual throughput

### 📁 File Management (Per-Channel Isolation)
- **Upload from PC** — drag-and-drop or click to browse (multi-file supported)
- **Import from Google Drive** — uses a connected channel's OAuth credentials
  - Browse folders, navigate subfolders, import individual files
  - Files are downloaded to your VPS for FFmpeg streaming
- Supported video formats: MP4, MOV, MKV, AVI, WebM, TS, FLV, M4V
- Per-file metadata (size, mime type, upload date)
- **🔍 Channel-scoped isolation** — files uploaded to Channel A do NOT appear in Channel B
  - Filter files by channel in the File Manager (dropdown: All / Unassigned / specific channel)
  - Uploads are automatically assigned to the selected channel
  - Google Drive imports are automatically assigned to the channel used for browsing
- **🗑️ Delete options**:
  - Single file delete (trash icon on each file card)
  - Delete all files for a channel (with confirmation)
  - Files are stored in `public/uploads/channels/{channelId}/` for clean filesystem isolation

### 📺 Multi-Channel Management
Each channel uses its own **Google Cloud Console credentials** (clientId + clientSecret):
- Add unlimited YouTube channels — each with separate API quota
- OAuth 2.0 flow with refresh tokens (auto-refreshed when expired)
- Per-channel sync — fetch latest YouTube channel info (subscriber count, view count, video count)
- Channel status tracking (active / inactive / error)
- Per-channel counter (streams / files / titles / thumbnails)
- **Channel detail view** — click any channel card to see its:
  - **Stream Titles list** (per-channel, with bulk add via paste)
  - **Thumbnails gallery** (per-channel, with multi-image upload)
  - **Video Files list** (per-channel, with upload & delete)

### 📝 Stream Titles (Per-Channel Rotator)
Each channel has its own independent list of stream titles:
- Add titles one-by-one or **bulk paste** (one title per line)
- Toggle individual titles on/off
- Reorder via sort order (persisted)
- Titles are used by the stream rotator to vary broadcast names (anti-spam)
- **Delete single** title or **delete all** titles for a channel
- Titles for Channel A never appear when configuring Channel B

### 🖼️ Thumbnails (Per-Channel Gallery)
Each channel has its own thumbnail collection:
- Upload multiple images at once (JPG, PNG, WebP, BMP)
- Visual gallery preview with file size
- **Delete single** thumbnail (hover overlay) or **delete all** thumbnails
- Stored in `public/uploads/thumbnails/{channelId}/` for clean filesystem isolation
- Thumbnails for Channel A never appear when configuring Channel B

> **Why per-channel credentials?** Google Cloud's YouTube Data API has a default quota of **10,000 units/day**. By using separate credentials per channel, you effectively multiply your quota by the number of channels — each channel gets its own 10,000 units.

### 🎥 Live Streaming (Stream-Key Based — Saves API Quota)
- **Live video streaming uses the YouTube stream key + FFmpeg RTMP** — NOT the API
  - This means streaming itself consumes **zero API quota**
  - The API is only used to *create* the broadcast (1 call) and *transition* its status (1-2 calls)
- **Multi-encoder support**: Auto / x264 (CPU) / NVENC / QuickSync / AMF / VideoToolbox
- **Copy mode** — stream without re-encoding (when all videos share specs)
- **Re-encode mode** — normalize resolution, FPS, bitrate, keyframe cadence
- Configurable: video bitrate, audio bitrate, resolution (up to 4K), FPS (24/30/60), preset
- Real-time stream status (scheduled / preparing / live / stopping / ended / error)
- Live FFmpeg log viewer (auto-refreshing)
- Start / Stop stream controls

### 🎨 Title Spinner (Anti-Spam)
- Varies stream titles with emojis to avoid YouTube spam detection
- 4 modes: Off / Emoji in front / Emoji at back / Both sides
- Curated emoji catalog (9 categories: Music, Film, Faces, Symbols, Gaming, Nature, Food, Travel, Flags)

### 📋 Activity Log
- Tracks all user actions: auth, channel, stream, file operations
- Color-coded by level (info / success / warning / error)
- Categorized by type for easy filtering

---

## 🎨 Design

- **Elegant black theme** — deep graphite backgrounds (`oklch(0.08 0.005 240)`)
- **Electric cyan accent** (`oklch(0.78 0.16 195)`) with emerald success color
- Subtle radial gradients and grid patterns
- Custom glow effects, pulse animations, and shimmer loading states
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
│  │  - Dashboard (VPS stats, charts, activity)          │    │
│  │  - Channel Manager (multi-API)                      │    │
│  │  - Stream Manager (FFmpeg controls)                 │    │
│  │  - File Manager (PC + Google Drive)                 │    │
│  │  - TanStack Query for server state                  │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│              VPS (Your Server)                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Next.js API Routes (Server-side)                   │    │
│  │  - /api/auth/*        (JWT auth)                    │    │
│  │  - /api/channels/*    (CRUD + OAuth)                │    │
│  │  - /api/streams/*     (CRUD + Start/Stop)           │    │
│  │  - /api/files/*       (Upload + Google Drive)       │    │
│  │  - /api/system/*      (VPS stats + FFmpeg detect)   │    │
│  │  - /api/dashboard     (Aggregated summary)          │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────────┐    │
│  │  Core Libraries                                     │    │
│  │  - auth.ts          (bcrypt + JWT)                  │    │
│  │  - youtube.ts       (googleapis v173)               │    │
│  │  - ffmpeg.ts        (child_process spawn)           │    │
│  │  - system-stats.ts  (systeminformation)             │    │
│  │  - gdrive.ts        (Google Drive API)              │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────────┐    │
│  │  Prisma ORM → SQLite                                │    │
│  │  Tables: User, Session, Channel, Stream,            │    │
│  │          UploadedFile, SystemMetric, ActivityLog    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FFmpeg Binary (system-installed)                   │    │
│  │  Pushes video via RTMP to YouTube using stream key  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │ RTMP
                           ▼
              ┌────────────────────────┐
              │   YouTube Live (RTMP)  │
              │   a.rtmp.youtube.com   │
              └────────────────────────┘
```

### Why This Architecture Saves API Quota

| Operation | Uses YouTube API? | Quota Cost |
|-----------|-------------------|------------|
| **Live video streaming** | ❌ No (uses stream key + RTMP) | **0 units** |
| Create broadcast | ✅ Yes | ~50 units |
| Transition to live | ✅ Yes | ~50 units |
| Transition to complete | ✅ Yes | ~50 units |
| Refresh channel info | ✅ Yes | ~10 units |

A typical 4-hour stream costs **~150 API units** total (vs. continuous API usage in some other tools). With the default 10,000 units/day quota per channel, you can run **60+ streams per day per channel** — and with multi-channel support, that multiplies accordingly.

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
# Push the Prisma schema to SQLite
bun run db:push

# Or with npm
npx prisma db push
```

### 5. Run the Development Server

```bash
bun run dev

# Or with npm
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 6. Production Build (for VPS deployment)

```bash
# Build the standalone production bundle
bun run build

# Start the production server
bun run start
```

The production build outputs a standalone bundle in `.next/standalone/` that you can deploy anywhere.

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
6. Choose **Desktop app** (or Web application)
7. Copy the **Client ID** and **Client Secret**
8. In ZephyrStream, go to **Channels → Add Channel**
9. Enter a name, your Client ID, and Client Secret
10. Click **Create Channel**
11. Click **Open Google Authorization** — sign in with your YouTube account
12. Copy the authorization code Google shows you
13. Paste it back in ZephyrStream and click **Connect Channel**

Repeat for each YouTube channel you want to manage.

### Step 3: Upload Video Files

**From PC:**
1. Go to **Files**
2. Drag-and-drop video files onto the upload zone, or click to browse
3. Multi-file upload is supported

**From Google Drive:**
1. Go to **Files → Google Drive**
2. Select a connected channel
3. Browse your Drive folders
4. Click **Import** next to any file to download it to your VPS

### Step 4: Create a Live Stream

1. Go to **Streams → New Stream**
2. Fill in the **Basic** tab:
   - Stream name
   - Description
   - (Optional) Select a connected channel — this auto-creates a YouTube broadcast
   - **YouTube Stream Key** — get this from YouTube Studio → Create → Go live → Stream settings
   - Duration, privacy, category, tags
3. Configure the **Source** tab:
   - Choose **Uploaded Files** or **Local Path**
   - Select the video files to stream
4. Configure the **FFmpeg** tab:
   - Encoder (Auto / x264 / NVENC / etc.)
   - Resolution, FPS, bitrate, preset
5. (Optional) Configure the **Spinner** tab for anti-spam emoji variation
6. Click **Create Stream**

### Step 5: Start Streaming

1. In the Streams list, click **Start** next to your stream
2. FFmpeg will begin pushing video to YouTube via RTMP
3. The status will change to **Live**
4. Click **Log** to view real-time FFmpeg output
5. Click **Stop** to end the stream

---

## 🛠️ Development

### Available Scripts

```bash
bun run dev        # Start dev server (port 3000)
bun run build      # Production build
bun run start      # Start production server
bun run lint       # Run ESLint
bun run db:push    # Push Prisma schema to database
bun run db:generate # Regenerate Prisma Client
bun run db:migrate  # Run migrations (dev)
bun run db:reset    # Reset database
```

### Project Structure

```
ZephyrStream/
├── prisma/
│   └── schema.prisma              # Database schema (7 models)
├── public/
│   ├── uploads/                   # User-uploaded video files
│   └── logo.svg                   # App logo
├── src/
│   ├── app/
│   │   ├── api/                   # API routes (Next.js Route Handlers)
│   │   │   ├── auth/              # signup, signin, signout, me
│   │   │   ├── channels/          # CRUD + OAuth + sync
│   │   │   ├── streams/           # CRUD + start/stop/log
│   │   │   ├── files/             # upload + google-drive + probe
│   │   │   ├── system/            # stats + speed-test + ffmpeg
│   │   │   ├── dashboard/         # Aggregated summary
│   │   │   └── activity-logs/     # Activity history
│   │   ├── globals.css            # Theme (elegant black)
│   │   ├── layout.tsx             # Root layout + providers
│   │   └── page.tsx               # Main SPA entry
│   ├── components/
│   │   ├── auth/                  # AuthForm
│   │   ├── layout/                # Sidebar, Header, MobileNav
│   │   ├── dashboard/             # StatsCards, MetricChart, etc.
│   │   ├── channels/              # ChannelList, ChannelForm
│   │   ├── streams/               # StreamList, StreamForm
│   │   ├── files/                 # FileManager
│   │   ├── common/                # Logo, StatusBadge
│   │   ├── providers.tsx          # QueryClientProvider
│   │   └── ui/                    # shadcn/ui components
│   ├── lib/
│   │   ├── auth.ts                # JWT + bcrypt
│   │   ├── constants.ts           # App constants & catalogs
│   │   ├── db.ts                  # Prisma client
│   │   ├── ffmpeg.ts              # FFmpeg spawn + ffprobe
│   │   ├── gdrive.ts              # Google Drive API
│   │   ├── system-stats.ts        # VPS monitoring
│   │   ├── youtube.ts             # YouTube Data API v3
│   │   └── utils.ts               # cn() helper
│   └── hooks/                     # Custom React hooks
├── .env.example                   # Environment template
├── .gitignore
├── next.config.ts
├── package.json
├── README.md                      # This file
└── tsconfig.json
```

### Database Schema

The Prisma schema defines 7 models:

- **User** — email, passwordHash, name, role
- **Session** — JWT token tracking (optional, for revocation)
- **Channel** — YouTube channel with OAuth credentials (one per channel)
- **Stream** — Live stream config (FFmpeg settings, stream key, source files)
- **UploadedFile** — Video files (local or Google Drive imported)
- **SystemMetric** — Historical VPS metrics (24h retention)
- **ActivityLog** — Audit trail of all user actions

---

## 🔒 Security Notes

- **Passwords** are hashed with bcrypt (12 salt rounds) — never stored in plaintext
- **JWT tokens** are signed with `JWT_SECRET` and stored in HttpOnly cookies
- **Cookies** are secure (HTTPS-only in production) with `sameSite: lax`
- **OAuth credentials** (clientId, clientSecret, refreshToken) are stored in the database
  - For production, consider encrypting these at rest with a separate key
- **File uploads** are sanitized (filename characters restricted)
- **Per-user data isolation** — every query is scoped to the authenticated user

### Production Hardening Recommendations

1. **Set a strong `JWT_SECRET`** (64+ random characters)
2. **Enable HTTPS** — use a reverse proxy like Caddy or Nginx with Let's Encrypt
3. **Encrypt OAuth credentials at rest** — add an encryption layer in `src/lib/youtube.ts`
4. **Rate limit auth endpoints** — prevent brute-force attacks on signin
5. **Backup the SQLite database** regularly
6. **Run as a non-root user** with limited permissions
7. **Use a firewall** — only expose ports 80/443

---

## ❓ Troubleshooting

### FFmpeg not detected
- Verify FFmpeg is installed: `ffmpeg -version`
- If installed but not in PATH, set `FFMPEG_PATH` and `FFPROBE_PATH` in `.env`
- Restart the dev server after changing `.env`

### Google OAuth fails
- Ensure the YouTube Data API v3 is enabled in Google Cloud Console
- Verify the Client ID and Client Secret are correct
- For Desktop apps, the redirect URI is `urn:ietf:wg:oauth:2.0:oob`
- For Web apps, configure the authorized redirect URIs

### Stream won't start
- Check that FFmpeg is installed and detectable
- Verify the YouTube stream key is valid (YouTube Studio → Go live)
- Check the stream log for FFmpeg errors (click **Log** in the Streams list)
- Ensure the source video files exist and are readable

### Upload fails
- Check that `public/uploads/` is writable by the Next.js process
- Verify the file size is within your server's upload limits
- For large files, increase `client_max_body_size` in Nginx (if using a reverse proxy)

### Database locked
- SQLite doesn't handle concurrent writes well — ensure only one instance is running
- For high-traffic deployments, consider switching to PostgreSQL

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
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) — YouTube + Drive API
- [systeminformation](https://github.com/sebhildebrandt/systeminformation) — VPS metrics
- [FFmpeg](https://ffmpeg.org/) — Video streaming

---

## 📞 Support

For issues, feature requests, or questions, please open an issue on [GitHub](https://github.com/lailiaindah/ZephyrStream/issues).

---

**ZephyrStream v1.0.0** — Built with ❤️ for the streaming community.
