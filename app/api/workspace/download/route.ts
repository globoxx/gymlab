import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/serverAuth";
import JSZip from "jszip"; // if moduleResolution issues, fallback to: import * as JSZip from 'jszip'

// GET /api/workspace/download?id=<itemId>
// If id is a file -> returns raw file bytes.
// If id is a folder (or omitted => root) -> returns a zip of folder subtree.
export async function GET(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");

    // Resolve root if no id provided
    if (!id) {
      const root = await prisma.item.findFirst({ where: { ownerId: userId, parentId: null, isFolder: true } });
      if (!root) {
        return NextResponse.json({ error: "Dossier racine introuvable" }, { status: 404 });
      }
      id = root.id;
    }

    const item = await prisma.item.findUnique({ where: { id } });
    if (!item || item.ownerId !== userId) {
      return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
    }

    if (!item.isFolder) {
      // Single file download
      const filename = sanitizeFilename(item.name);
      const body = item.content ? Buffer.from(item.content) : Buffer.from("");
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": body.length.toString(),
          "Cache-Control": "no-store"
        }
      });
    }

    // Folder: fetch all descendant items (simple multi-query recursion)
    const all = await prisma.item.findMany({ where: { ownerId: userId } });
    // Build map id->children for quick traversal
    const byParent = new Map<string | null, typeof all>();
    for (const it of all) {
      const arr = byParent.get(it.parentId) || [];
      arr.push(it);
      byParent.set(it.parentId, arr);
    }

    const rootItem = item;
    const zip = new JSZip();

    const walk = (folder: typeof item, currentPath: string) => {
      const children = byParent.get(folder.id) || [];
      for (const child of children) {
        if (child.isFolder) {
          walk(child, currentPath + child.name + "/");
        } else {
          const content = child.content ? Buffer.from(child.content) : Buffer.from("");
          zip.file(currentPath + child.name, content);
        }
      }
    };

    walk(rootItem, "");

    // If folder is empty create a placeholder to ensure zip not empty (optional): skip for now.

    const zipContent = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const zipName = sanitizeFilename(rootItem.name || "workspace") + ".zip";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Response(zipContent as any, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Content-Length": zipContent.length.toString(),
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    console.error("Download error", e);
    return NextResponse.json({ error: "Erreur téléchargement" }, { status: 500 });
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}
