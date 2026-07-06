// /api/channels/[id] — Get, update, or delete a specific channel
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import { UPLOAD_DIR } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    // SECURITY: use explicit `select` to exclude sensitive OAuth fields
    // (accessToken, refreshToken) from the response — same fix applied
    // to the list endpoint. Previously this used `include` which returns
    // ALL scalar fields including tokens. Google refresh tokens don't
    // expire, so leaking them allows indefinite YouTube impersonation.
    const channel = await db.channel.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
        youtubeChannelId: true,
        youtubeChannelName: true,
        clientId: true,
        clientSecret: true,
        // accessToken and refreshToken are EXCLUDED
        tokenExpiresAt: true,
        status: true,
        lastSyncAt: true,
        titleRotatorIndex: true,
        thumbnailRotatorIndex: true,
        createdAt: true,
        updatedAt: true,
        streams: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            name: true,
            status: true,
            startAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            streams: true,
            files: true,
            titles: true,
            thumbnails: true,
            playlists: true,
          },
        },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    return NextResponse.json({ channel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { name, description, clientId, clientSecret, status } = body;

    const channel = await db.channel.findFirst({
      where: { id, userId: user.id },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // SECURITY: Don't allow setting status to "active" if the channel has
    // no OAuth tokens. Otherwise the scheduler would try to create a
    // broadcast, fail (no refresh token), and FFmpeg would push to YouTube
    // with no broadcast metadata (untitled stream in YouTube Studio).
    if (status === "active" && !channel.refreshToken && !channel.accessToken) {
      return NextResponse.json(
        { error: "Cannot set status to 'active' — channel is not connected to YouTube. Authorize it first." },
        { status: 400 }
      );
    }

    // SECURITY: use `select` to exclude accessToken and refreshToken from
    // the response — same protection as the GET endpoint. Without this,
    // Prisma's update returns ALL scalar fields including the OAuth tokens.
    const updated = await db.channel.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(clientId !== undefined && { clientId }),
        ...(clientSecret !== undefined && { clientSecret }),
        ...(status !== undefined && { status }),
      },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
        youtubeChannelId: true,
        youtubeChannelName: true,
        clientId: true,
        clientSecret: true,
        // accessToken and refreshToken are EXCLUDED
        tokenExpiresAt: true,
        status: true,
        lastSyncAt: true,
        titleRotatorIndex: true,
        thumbnailRotatorIndex: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ channel: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const channel = await db.channel.findFirst({
      where: { id, userId: user.id },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Before deleting the channel row (which cascades to files, titles,
    // thumbnails, playlists, streams), collect the physical file paths
    // so we can delete them from disk too. Otherwise disk fills up with
    // orphaned files belonging to deleted channels.
    const [filesToDelete, thumbnailsToDelete, liveStreams] = await Promise.all([
      db.uploadedFile.findMany({
        where: { channelId: id },
        select: { storagePath: true },
      }),
      db.thumbnailItem.findMany({
        where: { channelId: id },
        select: { storagePath: true },
      }),
      // Find any live/preparing streams on this channel so we can stop
      // their FFmpeg processes BEFORE deleting the channel. Otherwise the
      // streams survive (schema uses SetNull) with a running PID, FFmpeg
      // keeps pushing to YouTube, and the scheduler can't easily stop
      // them (the channel's OAuth tokens are gone).
      db.stream.findMany({
        where: { channelId: id, status: { in: ["live", "preparing", "stopping"] } },
        select: { id: true, pid: true, name: true },
      }),
    ]);

    const physicalPaths = [
      ...filesToDelete.map((f) => f.storagePath),
      ...thumbnailsToDelete.map((t) => t.storagePath),
    ].filter(Boolean) as string[];

    // Stop any running FFmpeg processes for streams on this channel.
    // Mark the streams as "ended" so the scheduler's ghost cleanup
    // doesn't try to restart them.
    if (liveStreams.length > 0) {
      const { stopFFmpegStream } = await import("@/lib/ffmpeg");
      for (const s of liveStreams) {
        if (s.pid) {
          try {
            await stopFFmpegStream(s.pid);
          } catch (err) {
            console.warn(`[Channel Delete] Failed to stop FFmpeg for stream ${s.id}:`, err);
          }
        }
        await db.stream.update({
          where: { id: s.id },
          data: { status: "ended", endedAt: new Date(), pid: null },
        }).catch(() => {});
      }
    }

    // Delete the channel row (cascades to all related DB rows)
    await db.channel.delete({ where: { id } });

    // Best-effort cleanup of physical files. Use Promise.allSettled so
    // one failure doesn't fail the whole delete — the DB rows are already
    // gone, and a leftover file is just disk waste (not a correctness bug).
    if (physicalPaths.length > 0) {
      await Promise.allSettled(physicalPaths.map((p) => fs.unlink(p)));
    }

    // Also remove the per-channel upload directory if it exists
    const channelUploadDir = path.join(UPLOAD_DIR, "channels", id);
    const thumbUploadDir = path.join(UPLOAD_DIR, "thumbnails", id);
    await Promise.allSettled([
      fs.rm(channelUploadDir, { recursive: true, force: true }),
      fs.rm(thumbUploadDir, { recursive: true, force: true }),
    ]);

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "channel",
        message: `Channel deleted: ${channel.name}`,
        details: `Cleaned up ${physicalPaths.length} physical file(s)`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
