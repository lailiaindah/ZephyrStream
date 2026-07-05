// Google Drive integration — used for uploading/importing source files
// Uses each channel's OAuth credentials OR a global Google Drive API key

import { google } from "googleapis";
import { db } from "@/lib/db";

// List files in a Google Drive folder
export async function listDriveFiles(
  accessToken: string,
  refreshToken: string | undefined,
  clientId: string,
  clientSecret: string,
  folderId: string = "root"
) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  // SECURITY: escape single quotes in folderId before interpolating into
  // the Drive query string. Drive file IDs are normally alphanumeric, but
  // a malformed ID with a single quote would break the query syntax (and
  // could potentially be used to inject query operators). Drive's API
  // requires escaping `'` as `\'` inside single-quoted string literals.
  const safeFolderId = (folderId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `'${safeFolderId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, size, modifiedTime, thumbnailLink)",
    pageSize: 200,
    orderBy: "modifiedTime desc",
  });

  return response.data.files || [];
}

// Get metadata for a specific Google Drive file
export async function getDriveFile(
  fileId: string,
  accessToken: string,
  refreshToken: string | undefined,
  clientId: string,
  clientSecret: string
) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const response = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, size, modifiedTime, thumbnailLink, webViewLink",
  });

  return response.data;
}

// Download a file from Google Drive and save it locally
export async function downloadDriveFile(
  fileId: string,
  destinationPath: string,
  accessToken: string,
  refreshToken: string | undefined,
  clientId: string,
  clientSecret: string
): Promise<{ size: number; mimeType: string }> {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  const fs = await import("fs/promises");
  const { createWriteStream } = await import("fs");
  const stream = await import("stream");
  const { promisify } = await import("util");
  const pipeline = promisify(stream.pipeline);

  const fileMetadata = await drive.files.get({
    fileId,
    fields: "size, mimeType",
  });

  const ws = createWriteStream(destinationPath);
  await pipeline(response.data as NodeJS.ReadableStream, ws);

  return {
    size: parseInt(fileMetadata.data.size || "0", 10),
    mimeType: fileMetadata.data.mimeType || "application/octet-stream",
  };
}

// Generate OAuth URL for Google Drive access (separate from YouTube scope)
export function getDriveAuthUrl(clientId: string, clientSecret: string, state: string): string {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
    state,
    prompt: "consent",
  });
}

// Exchange authorization code for Google Drive tokens
export async function exchangeDriveCode(
  clientId: string,
  clientSecret: string,
  code: string
) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/channels/oauth-callback"
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}
