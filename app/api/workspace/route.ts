import { requireUserId } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";

import type { Item } from "@prisma/client";
import { ITreeObjDir, ITreeObjFile, TreeObj } from "@/types/fileExplorer";

function ItemToTreeObj(item: Item): ITreeObjDir | ITreeObjFile {
  if (item.isFolder) {
    return {
      id: item.id,
      parentId: item.parentId ?? undefined,
      name: item.name,
      type: "directory",
      children: [],
      canRename: item.canRename,
      canDelete: item.canDelete,
      canMove: item.canMove,
    };
  } else {
    return {
      id: item.id,
      parentId: item.parentId ?? undefined,
      name: item.name,
      type: "file",
      content: item.content ? Buffer.from(item.content).toString('base64') : null,
      canRename: item.canRename,
      canDelete: item.canDelete,
      canMove: item.canMove,
    };
  }
}

function getWorkspaceStructureFromRoot(
  root: ITreeObjDir,
  allItems: TreeObj[]
): ITreeObjDir {
  const children = allItems.filter((item) => item.parentId === root.id);
  const remainingItems = allItems.filter((item) => item.parentId !== root.id);
  return {
    ...root,
    children: children.map((child) => {
      if (child.type === "directory") {
        return getWorkspaceStructureFromRoot(child, remainingItems);
      }
      return child;
    }),
  };
}

// This route handles fetching the workspace structure for the authenticated user
export async function GET(request: NextRequest) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  // Récupère tous les fichiers de l'élève
  const items = await prisma.item.findMany({
    where: { ownerId: userId },
  });
  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "Aucun fichier trouvé" },
      { status: 404 }
    );
  }

  // Si un dossier spécifique est demandé, ne retourner que ce sous-arbre
  const folderId = request.nextUrl.searchParams.get("id");
  if (folderId) {
    const folderItem = items.find((it) => it.id === folderId && it.isFolder);
    if (!folderItem) {
      return NextResponse.json(
        { error: "Dossier demandé introuvable" },
        { status: 404 }
      );
    }
    const root = ItemToTreeObj(folderItem) as ITreeObjDir;
    const allItems = items.map(ItemToTreeObj);
    const workspace = getWorkspaceStructureFromRoot(root, allItems);
    return NextResponse.json({ workspace }, { status: 200 });
  }

  const rootItem = items.find(
    (item) => item.isFolder && item.parentId === null
  );
  if (!rootItem) {
    return NextResponse.json(
      { error: "Aucun dossier racine trouvé" },
      { status: 404 }
    );
  }

  const root = ItemToTreeObj(rootItem) as ITreeObjDir;
  const allItems = items.map(ItemToTreeObj);
  const workspace = getWorkspaceStructureFromRoot(root, allItems);
  return NextResponse.json({ workspace }, { status: 200 });
}
