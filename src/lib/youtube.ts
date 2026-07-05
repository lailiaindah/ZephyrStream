// YouTube Data API v3 wrapper — used ONLY for broadcast/stream management
// Each channel uses its own OAuth credentials (clientId + clientSecret + refreshToken)
// Live streaming itself uses the YouTube stream key + FFmpeg (saves API quota)

import { google } from "googleapis";
import { db } from "@/lib/db";

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

// Build an OAuth2 client using a channel's stored credentials
export function buildOAuthClient(channel: {
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
  accessToken: string | null;
  tokenExpiresAt: Date | null;
}) {
  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    // Redirect URI configured in Google Cloud Console — for desktop/web apps
    // We use postmessage for token exchange flexibility
    "http://localhost:3000/api/channels/oauth-callback"
  );

  if (channel.refreshToken || channel.accessToken) {
    oauth2Client.setCredentials({
      access_token: channel.accessToken || undefined,
      refresh_token: channel.refreshToken || undefined,
      expiry_date: channel.tokenExpiresAt?.getTime() || undefined,
    });
  }

  return oauth2Client;
}

// Generate the OAuth authorization URL for a channel.
// Uses a web redirect URI (NOT the deprecated OOB flow).
// The redirectUri should be the full URL back to the app's callback endpoint,
// e.g. http://IP-VPS:3000/api/channels/oauth-callback
export function getAuthUrl(
  clientId: string,
  clientSecret: string,
  state: string,
  redirectUri: string
): string {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    state,
    prompt: "consent", // force consent to get a new refresh token
  });
}

// Exchange an authorization code for tokens.
// redirectUri must match the one used in getAuthUrl.
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string | undefined;
  expiry_date: number;
}> {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.access_token) throw new Error("Failed to obtain access token");

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
  };
}

// Refresh an expired access token using the stored refresh token.
// CRITICAL: Google refresh tokens do NOT expire (unless revoked by user),
// so as long as we keep refreshing access tokens proactively, the channel
// stays authenticated indefinitely without re-authorization.
//
// If Google returns a NEW refresh token (rare, but happens on rotation),
// we persist it — this is called "refresh token rotation" and is a
// security best practice.
export async function refreshAccessToken(channelId: string): Promise<string> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");
  if (!channel.refreshToken) throw new Error("No refresh token — re-authorize the channel");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ refresh_token: channel.refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  if (!credentials.access_token) throw new Error("Failed to refresh access token");

  // Build update data — always update access token + expiry
  const updateData: any = {
    accessToken: credentials.access_token,
    tokenExpiresAt: credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600 * 1000),
    lastSyncAt: new Date(),
    status: "active",
  };

  // If Google returned a NEW refresh token (rotation), persist it.
  // Otherwise keep the existing one (refresh tokens are long-lived).
  if (credentials.refresh_token && credentials.refresh_token !== channel.refreshToken) {
    updateData.refreshToken = credentials.refresh_token;
    console.log(`[Auth] Refresh token rotated for channel ${channelId}`);
  }

  await db.channel.update({
    where: { id: channelId },
    data: updateData,
  });

  return credentials.access_token;
}

// Get a valid access token for a channel (refresh if needed)
export async function getValidAccessToken(channelId: string): Promise<string> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");
  if (!channel.accessToken || !channel.tokenExpiresAt) {
    return refreshAccessToken(channelId);
  }
  // Refresh if token expires within the next 5 minutes
  if (channel.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    return refreshAccessToken(channelId);
  }
  return channel.accessToken;
}

// Fetch the YouTube channel info for the authenticated user
export async function getChannelInfo(channelId: string): Promise<YouTubeChannelInfo> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const response = await youtube.channels.list({
    part: ["snippet", "statistics"],
    mine: true,
  });

  const item = response.data.items?.[0];
  if (!item) throw new Error("No YouTube channel associated with this account");

  return {
    id: item.id!,
    title: item.snippet?.title || "Unknown",
    description: item.snippet?.description || "",
    thumbnailUrl: item.snippet?.thumbnails?.default?.url || "",
    subscriberCount: parseInt(item.statistics?.subscriberCount || "0", 10),
    viewCount: parseInt(item.statistics?.viewCount || "0", 10),
    videoCount: parseInt(item.statistics?.videoCount || "0", 10),
  };
}

// Create a YouTube live broadcast (uses API quota — minimal calls)
export async function createBroadcast(
  channelId: string,
  params: {
    title: string;
    description: string;
    startAt: Date;
    endAt: Date;
    privacyStatus: string;
    categoryId?: string;
    tags?: string[];
    thumbnailUrl?: string;
    madeForKids?: boolean;
  }
): Promise<{ broadcastId: string; streamId: string }> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // 1. Create the broadcast
  const broadcastResponse = await youtube.liveBroadcasts.insert({
    part: ["snippet", "status", "contentDetails"],
    requestBody: {
      snippet: {
        title: params.title,
        description: params.description,
        scheduledStartTime: params.startAt.toISOString(),
        scheduledEndTime: params.endAt.toISOString(),
        categoryId: params.categoryId || "22",
        tags: params.tags,
      },
      status: {
        privacyStatus: params.privacyStatus,
        selfDeclaredMadeForKids: params.madeForKids || false,
      },
      contentDetails: {
        enableAutoStart: false,
        enableAutoStop: false,
        monitorStream: {
          enableMonitorStream: false,
        },
      },
    },
  });

  const broadcastId = broadcastResponse.data.id!;

  // 2. Create a stream bound to the broadcast — but we don't use the ingestAddress
  // Instead, the user provides their own YouTube stream key for FFmpeg RTMP streaming.
  // This saves API quota and avoids the binding overhead.
  // We still create a liveStream to satisfy YouTube's broadcast <-> stream binding.
  const streamResponse = await youtube.liveStreams.insert({
    part: ["snippet", "cdn"],
    requestBody: {
      snippet: { title: `${params.title} - stream` },
      cdn: {
        frameRate: "30fps",
        ingestionType: "rtmp",
        resolution: "1080p",
      },
    },
  });

  const streamId = streamResponse.data.id!;

  // 3. Bind the broadcast to the stream
  await youtube.liveBroadcasts.bind({
    id: broadcastId,
    streamId: streamId,
    part: ["id", "contentDetails"],
  });

  return { broadcastId, streamId };
}

// Transition a broadcast to the next status (testing -> live -> complete)
// Transition a broadcast to the next status (testing -> live -> complete).
// Includes RETRY logic because YouTube often needs a few seconds to process
// state transitions. Without retries, "complete" transition can fail with
// "The broadcast is not in a state that can be transitioned to complete".
export async function transitionBroadcast(
  channelId: string,
  broadcastId: string,
  status: "testing" | "live" | "complete",
  maxRetries: number = 5
): Promise<void> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await youtube.liveBroadcasts.transition({
        id: broadcastId,
        broadcastStatus: status,
        part: ["id", "status", "contentDetails"],
      });
      console.log(`[YouTube] Broadcast ${broadcastId} transitioned to "${status}" (attempt ${attempt})`);
      return; // success
    } catch (err: any) {
      lastError = err;
      const isRetriable =
        err.message?.includes("not in a state") ||
        err.message?.includes("transition") ||
        err.message?.includes("rate") ||
        err.message?.includes("backend");

      if (!isRetriable || attempt === maxRetries) {
        console.warn(`[YouTube] Transition to "${status}" failed permanently (attempt ${attempt}/${maxRetries}):`, err.message);
        throw err;
      }

      // Exponential backoff: 5s, 10s, 20s, 40s, 80s
      const backoffMs = 5000 * Math.pow(2, attempt - 1);
      console.warn(`[YouTube] Transition to "${status}" failed (attempt ${attempt}/${maxRetries}), retrying in ${backoffMs / 1000}s: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

// Update a broadcast's snippet (title, description, etc.)
export async function updateBroadcast(
  channelId: string,
  broadcastId: string,
  params: {
    title?: string;
    description?: string;
    privacyStatus?: string;
    categoryId?: string;
    tags?: string[];
    startAt?: Date;
    endAt?: Date;
  }
): Promise<void> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  await youtube.liveBroadcasts.update({
    part: ["snippet", "status"],
    requestBody: {
      id: broadcastId,
      snippet: {
        title: params.title,
        description: params.description,
        scheduledStartTime: (params.startAt || new Date()).toISOString(),
        scheduledEndTime: (params.endAt || new Date(Date.now() + 4 * 60 * 60 * 1000)).toISOString(),
        categoryId: params.categoryId || "22",
        tags: params.tags,
      },
      status: {
        privacyStatus: params.privacyStatus || "public",
        selfDeclaredMadeForKids: false,
      },
    },
  });
}

// Delete a broadcast
export async function deleteBroadcast(
  channelId: string,
  broadcastId: string
): Promise<void> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  await youtube.liveBroadcasts.delete({ id: broadcastId });
}

// === CREATE OR UPDATE BROADCAST ===
// If the stream already has a broadcastId, UPDATE the existing live event.
// If not, CREATE a new live event.
// This prevents duplicate broadcasts in YouTube Studio when a stream is
// restarted or edited.
export async function createOrUpdateBroadcast(
  channelId: string,
  existingBroadcastId: string | null | undefined,
  params: {
    title: string;
    description: string;
    startAt: Date;
    endAt: Date;
    privacyStatus: string;
    categoryId?: string;
    tags?: string[];
  }
): Promise<{ broadcastId: string; streamId: string; created: boolean }> {
  // If we already have a broadcastId, try to update the existing broadcast
  if (existingBroadcastId) {
    try {
      await updateBroadcast(channelId, existingBroadcastId, {
        title: params.title,
        description: params.description,
        privacyStatus: params.privacyStatus,
        categoryId: params.categoryId,
        tags: params.tags,
        startAt: params.startAt,
        endAt: params.endAt,
      });
      console.log(`[YouTube] Updated existing broadcast: ${existingBroadcastId}`);
      // Return the existing broadcastId + a placeholder streamId
      // (streamId is only needed for binding, which already happened)
      return { broadcastId: existingBroadcastId, streamId: "", created: false };
    } catch (err: any) {
      console.warn(`[YouTube] Failed to update broadcast ${existingBroadcastId}, creating new:`, err.message);
      // Fall through to createBroadcast if update fails (e.g. broadcast was deleted)
    }
  }

  // No existing broadcastId (or update failed) — create a new one
  const result = await createBroadcast(channelId, params);
  console.log(`[YouTube] Created new broadcast: ${result.broadcastId}`);
  return { ...result, created: true };
}

// List all upcoming/active broadcasts for the channel
export async function listBroadcasts(channelId: string) {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const response = await youtube.liveBroadcasts.list({
    part: ["snippet", "status"],
    broadcastStatus: "upcoming",
    maxResults: 25,
  });

  return response.data.items || [];
}

// ============================================================
// TITLE & THUMBNAIL ROTATOR
// ============================================================

// Get the next title for a channel using the rotator index.
// If shuffle=true, picks a RANDOM title instead of sequential.
export async function getNextTitle(
  channelId: string,
  spinnerMode: string,
  spinnerEmojis: string[],
  shuffle: boolean = false
): Promise<string | null> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;

  const titles = await db.titleItem.findMany({
    where: { channelId, enabled: true },
    orderBy: { sortOrder: "asc" },
  });

  if (titles.length === 0) return null;

  // Pick title: random or sequential
  let idx: number;
  if (shuffle) {
    idx = Math.floor(Math.random() * titles.length);
  } else {
    idx = channel.titleRotatorIndex % titles.length;
  }
  const titleItem = titles[idx];

  // Build the final title with optional emoji
  let finalTitle = titleItem.title;
  if (titleItem.emoji) {
    finalTitle = `${titleItem.emoji} ${finalTitle}`;
  }

  // Apply spinner emoji (overrides title-level emoji if mode is set)
  if (spinnerMode !== "off" && spinnerEmojis.length > 0) {
    const emoji = spinnerEmojis[Math.floor(Math.random() * spinnerEmojis.length)];
    if (spinnerMode === "front" || spinnerMode === "both") {
      finalTitle = `${emoji} ${finalTitle}`;
    }
    if (spinnerMode === "back" || spinnerMode === "both") {
      finalTitle = `${finalTitle} ${emoji}`;
    }
  }

  // Increment the rotator index for the next stream.
  // (Previously this was also incremented inside the `else` block above,
  // causing 2 redundant DB writes per title pick — same value both times,
  // so functionally OK but wasteful and clearly a copy-paste oversight.)
  await db.channel.update({
    where: { id: channelId },
    data: { titleRotatorIndex: idx + 1 },
  });

  return finalTitle;
}

// Get the next thumbnail for a channel using the rotator index.
// If shuffle=true, picks a RANDOM thumbnail instead of sequential.
export async function getNextThumbnail(
  channelId: string,
  shuffle: boolean = false
): Promise<{ id: string; storagePath: string; mimeType: string } | null> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;

  const thumbnails = await db.thumbnailItem.findMany({
    where: { channelId, enabled: true },
    orderBy: { sortOrder: "asc" },
  });

  if (thumbnails.length === 0) return null;

  let idx: number;
  if (shuffle) {
    idx = Math.floor(Math.random() * thumbnails.length);
  } else {
    idx = channel.thumbnailRotatorIndex % thumbnails.length;
    await db.channel.update({
      where: { id: channelId },
      data: { thumbnailRotatorIndex: idx + 1 },
    });
  }
  const thumb = thumbnails[idx];

  return {
    id: thumb.id,
    storagePath: thumb.storagePath,
    mimeType: thumb.mimeType,
  };
}

// Upload a thumbnail image to YouTube and bind it to a broadcast.
// Uses the thumbnails.set endpoint (cost: ~50 quota units).
export async function uploadThumbnail(
  channelId: string,
  broadcastId: string,
  thumbnailPath: string,
  mimeType: string
): Promise<string | null> {
  try {
    const accessToken = await getValidAccessToken(channelId);
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error("Channel not found");

    const oauth2Client = new google.auth.OAuth2(
      channel.clientId,
      channel.clientSecret,
      "http://localhost:3000/api/channels/oauth-callback"
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Read the image file
    const fs = await import("fs/promises");
    const buffer = await fs.readFile(thumbnailPath);

    // Upload via thumbnails.set
    const response = await youtube.thumbnails.set({
      videoId: broadcastId,
      requestBody: {},
      media: {
        body: buffer,
        mimeType,
      },
    });

    return response.data.items?.[0]?.url || null;
  } catch (err: any) {
    console.warn("Failed to upload thumbnail:", err.message);
    return null;
  }
}

// Reset the title rotator index to 0 (called when shuffle is clicked)
export async function resetTitleRotator(channelId: string): Promise<void> {
  await db.channel.update({
    where: { id: channelId },
    data: { titleRotatorIndex: 0 },
  });
}

// Reset the thumbnail rotator index to 0 (called when shuffle is clicked)
export async function resetThumbnailRotator(channelId: string): Promise<void> {
  await db.channel.update({
    where: { id: channelId },
    data: { thumbnailRotatorIndex: 0 },
  });
}

// ============================================================
// PICK TITLE & THUMBNAIL AT SCHEDULE CREATION TIME
// ============================================================
// This is called when a stream schedule is CREATED (not when it starts).
// It advances the rotator indexes so the next schedule gets the next
// title/thumbnail in the rotation.

export interface PickedTitleThumbnail {
  resolvedTitle: string | null;
  resolvedThumbnailPath: string | null;
  resolvedThumbnailMime: string | null;
  resolvedThumbnailId: string | null;
}

// Pick the next title and thumbnail for a channel.
// Advances the rotator indexes. Returns null values if the channel
// has no titles/thumbnails configured (caller should fall back to stream.name).
export async function pickTitleAndThumbnail(
  channelId: string,
  spinnerMode: string,
  spinnerEmojis: string[],
  shuffleTitle: boolean = false,
  shuffleThumbnail: boolean = false
): Promise<PickedTitleThumbnail> {
  const result: PickedTitleThumbnail = {
    resolvedTitle: null,
    resolvedThumbnailPath: null,
    resolvedThumbnailMime: null,
    resolvedThumbnailId: null,
  };

  // Pick title (random or sequential)
  try {
    const title = await getNextTitle(channelId, spinnerMode, spinnerEmojis, shuffleTitle);
    result.resolvedTitle = title;
  } catch (err: any) {
    console.warn("[Rotator] pickTitleAndThumbnail: title pick failed:", err.message);
  }

  // Pick thumbnail (random or sequential)
  try {
    const thumb = await getNextThumbnail(channelId, shuffleThumbnail);
    if (thumb) {
      result.resolvedThumbnailPath = thumb.storagePath;
      result.resolvedThumbnailMime = thumb.mimeType;
      result.resolvedThumbnailId = thumb.id;
    }
  } catch (err: any) {
    console.warn("[Rotator] pickTitleAndThumbnail: thumbnail pick failed:", err.message);
  }

  return result;
}
