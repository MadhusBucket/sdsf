import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null
): Promise<string> {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const res = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const existing = res.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return created.data.id!;
}

async function resolveFolderPath(
  drive: ReturnType<typeof google.drive>,
  folderPath: string,
  rootFolderId: string
): Promise<string> {
  // Skip the first segment ("SDSF") — rootFolderId IS that folder
  const parts = folderPath.split("/").filter(Boolean).slice(1);
  let parentId: string = rootFolderId;
  for (const part of parts) {
    parentId = await getOrCreateFolder(drive, part, parentId);
  }
  return parentId;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) {
    return NextResponse.json({ error: "Google service account not configured" }, { status: 500 });
  }

  let serviceAccountKey: Record<string, string>;
  try {
    serviceAccountKey = JSON.parse(keyRaw);
  } catch {
    return NextResponse.json({ error: "Invalid service account key" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folderPath = formData.get("folderPath") as string | null;
  const fileName = formData.get("fileName") as string | null;

  if (!file || !folderPath || !fileName) {
    return NextResponse.json({ error: "Missing file, folderPath, or fileName" }, { status: 400 });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });

    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) {
      throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
    }

    const folderId = await resolveFolderPath(drive, folderPath, rootFolderId);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { Readable } = await import("stream");
    const stream = Readable.from(buffer);

    const uploaded = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: "application/pdf",
        body: stream,
      },
      fields: "id",
    });

    const fileId = uploaded.data.id;
    return NextResponse.json({ fileId });
  } catch (e) {
    console.error("[drive/upload]", e);
    return NextResponse.json(
      { error: "Drive upload failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
