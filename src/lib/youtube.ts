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
    "urn:ietf:wg:oauth:2.0:oob"
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

// Generate the OAuth authorization URL for a channel
export function getAuthUrl(clientId: string, clientSecret: string, state: string): string {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
    state,
    prompt: "consent", // force consent to get a new refresh token
  });
}

// Exchange an authorization code for tokens
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{
  access_token: string;
  refresh_token: string | undefined;
  expiry_date: number;
}> {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.access_token) throw new Error("Failed to obtain access token");

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
  };
}

// Refresh an expired access token using the stored refresh token
export async function refreshAccessToken(channelId: string): Promise<string> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");
  if (!channel.refreshToken) throw new Error("No refresh token — re-authorize the channel");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2Client.setCredentials({ refresh_token: channel.refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  if (!credentials.access_token) throw new Error("Failed to refresh access token");

  await db.channel.update({
    where: { id: channelId },
    data: {
      accessToken: credentials.access_token,
      tokenExpiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000),
      lastSyncAt: new Date(),
      status: "active",
    },
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
    "urn:ietf:wg:oauth:2.0:oob"
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
    "urn:ietf:wg:oauth:2.0:oob"
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
export async function transitionBroadcast(
  channelId: string,
  broadcastId: string,
  status: "testing" | "live" | "complete"
): Promise<void> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  await youtube.liveBroadcasts.transition({
    id: broadcastId,
    broadcastStatus: status,
    part: ["id", "status", "contentDetails"],
  });
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
  }
): Promise<void> {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
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
        scheduledStartTime: new Date().toISOString(),
        scheduledEndTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
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
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  await youtube.liveBroadcasts.delete({ id: broadcastId });
}

// List all upcoming/active broadcasts for the channel
export async function listBroadcasts(channelId: string) {
  const accessToken = await getValidAccessToken(channelId);
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const oauth2Client = new google.auth.OAuth2(
    channel.clientId,
    channel.clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
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
