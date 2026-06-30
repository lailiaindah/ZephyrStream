// DELETE /api/system/backup/delete/[filename] — Delete a specific backup
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteBackup } from "@/lib/backup";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { filename } = await params;

    try {
      await deleteBackup(filename);
      return NextResponse.json({ success: true });
    } catch (err: any) {
      if (err.message === "Invalid backup filename") {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
