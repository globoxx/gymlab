import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

interface IncomingFile {
  path: string; // relative path e.g. dir/sub/file.py
  content: string; // base64
}

// POST /api/workspace/upload
// Body: { parentId?: string | null, files: IncomingFile[] }
// Creates missing folders & files under parentId (or user's root) preserving hierarchy.
export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  try {
    const { parentId, files } = (await req.json()) as {
      parentId?: string | null;
      files: IncomingFile[];
    };
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }
    if (files.length > 500) {
      return NextResponse.json(
        { error: "Trop de fichiers (max 500)" },
        { status: 400 }
      );
    }

    // Resolve target parent (root if omitted)
    let targetParentId: string | null = parentId ?? null;
    if (!targetParentId) {
      // fetch root folder
      const root = await prisma.item.findFirst({
        where: { ownerId: userId, parentId: null, isFolder: true },
      });
      if (!root)
        return NextResponse.json(
          { error: "Dossier racine introuvable" },
          { status: 404 }
        );
      targetParentId = root.id;
    } else {
      const parent = await prisma.item.findUnique({
        where: { id: targetParentId },
      });
      if (!parent || parent.ownerId !== userId || !parent.isFolder) {
        return NextResponse.json(
          { error: "Dossier parent invalide" },
          { status: 400 }
        );
      }
      if (parent.canMoveIn === false) {
        return NextResponse.json(
          { error: "Upload vers ce dossier non autorisé" },
          { status: 403 }
        );
      }
    }

    // Normalize & collect directories
    const normFiles: { parts: string[]; name: string; content: string }[] = [];
    const dirSet = new Set<string>(); // e.g. "", "dir", "dir/sub"
    dirSet.add(""); // root relative to parentId
    const invalid: string[] = [];
    for (const f of files) {
      if (!f || typeof f.path !== "string" || typeof f.content !== "string")
        continue;
      const p = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (p.includes("..")) {
        invalid.push(f.path);
        continue;
      }
      const segs = p.split("/").filter(Boolean);
      if (segs.length === 0) continue;
      normFiles.push({
        parts: segs.slice(0, -1),
        name: segs[segs.length - 1],
        content: f.content,
      });
      for (let i = 0; i < segs.length - 1; i++) {
        dirSet.add(segs.slice(0, i + 1).join("/"));
      }
    }
    if (normFiles.length === 0) {
      return NextResponse.json(
        { error: "Aucun fichier exploitable" },
        { status: 400 }
      );
    }

    // Sort directories by depth
    const dirs = Array.from(dirSet).sort(
      (a, b) => a.split("/").length - b.split("/").length
    );
    const dirIdMap = new Map<string, string>();
    dirIdMap.set("", targetParentId); // base mapping

    // Create missing directories sequentially (depth-first)
    for (const d of dirs) {
      if (d === "") continue;
      const parts = d.split("/");
      const parentPath = parts.slice(0, -1).join("/");
      const dirName = parts[parts.length - 1];
      const parentDbId = dirIdMap.get(parentPath);
      if (!parentDbId) continue;
      const existing = await prisma.item.findFirst({
        where: {
          ownerId: userId,
          parentId: parentDbId,
          name: dirName,
          isFolder: true,
        },
      });
      if (existing) {
        dirIdMap.set(d, existing.id);
        continue;
      }
      const newId = uuidv4();
      await prisma.item.create({
        data: {
          id: newId,
          name: dirName,
          isFolder: true,
          ownerId: userId,
          parentId: parentDbId,
          size: 0,
        },
      });
      dirIdMap.set(d, newId);
    }

    const fileCreates: ReturnType<typeof prisma.item.create>[] = [];
    const sizeIncMap = new Map<string, number>();
    const createdFiles: { path: string; id: string }[] = [];
    const skipped: string[] = [];
    for (const f of normFiles) {
      const dirPath = f.parts.join("/");
      const parentFolderId = dirIdMap.get(dirPath) || targetParentId!;
      const exists = await prisma.item.findFirst({
        where: {
          ownerId: userId,
          parentId: parentFolderId,
          name: f.name,
          isFolder: false,
        },
      });
      if (exists) {
        skipped.push([...f.parts, f.name].join("/"));
        continue;
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(f.content, "base64");
      } catch {
        skipped.push([...f.parts, f.name].join("/"));
        continue;
      }
      const fileId = uuidv4();
      fileCreates.push(
        prisma.item.create({
          data: {
            id: fileId,
            name: f.name,
            isFolder: false,
            ownerId: userId,
            parentId: parentFolderId,
            content: buf,
            size: buf.length,
          },
        })
      );
      createdFiles.push({ path: [...f.parts, f.name].join("/"), id: fileId });
      if (buf.length > 0) {
        const bubble = f.parts;
        for (let depth = bubble.length; depth >= 0; depth--) {
          const sub = bubble.slice(0, depth).join("/");
          const dirDbId = dirIdMap.get(sub);
          if (dirDbId)
            sizeIncMap.set(
              dirDbId,
              (sizeIncMap.get(dirDbId) || 0) + buf.length
            );
        }
      }
    }

    await prisma.$transaction([
      ...fileCreates,
      ...Array.from(sizeIncMap.entries()).map(([id, inc]) =>
        prisma.item.update({
          where: { id },
          data: { size: { increment: inc } },
        })
      ),
    ]);

    return NextResponse.json(
      { created: createdFiles, skipped, invalid, parentId: targetParentId },
      { status: 201 }
    );
  } catch (e) {
    console.error("Upload error", e);
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}
