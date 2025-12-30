import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";

// Cette route permet de déplacer un fichier ou dossier vers un autre dossier
export async function PATCH(request: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    const { itemId, newParentId } = await request.json();

    if (!itemId) {
      return NextResponse.json(
        { error: "ID de l'élément manquant" },
        { status: 400 }
      );
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } });

    if (!item) {
      return NextResponse.json(
        { error: "Élément introuvable" },
        { status: 404 }
      );
    }

    if (item.canMove === false) {
      return NextResponse.json(
        { error: "Déplacement de cet élément non autorisé" },
        { status: 403 }
      );
    }

    if (item.ownerId !== userId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour déplacer cet élément" },
        { status: 403 }
      );
    }

    if (item.parentId === null) {
      return NextResponse.json(
        { error: "Impossible de déplacer le dossier racine" },
        { status: 400 }
      );
    }
    if (!newParentId) {
      return NextResponse.json(
        { error: "Déplacement vers la racine non autorisé" },
        { status: 400 }
      );
    }
    const newParent = await prisma.item.findUnique({
      where: { id: newParentId },
    });
    if (!newParent)
      return NextResponse.json(
        { error: "Dossier de destination introuvable" },
        { status: 404 }
      );
    if (!newParent.isFolder)
      return NextResponse.json(
        { error: "La destination doit être un dossier" },
        { status: 400 }
      );
    if (newParent.canMoveIn === false)
      return NextResponse.json(
        { error: "Déplacement vers ce dossier non autorisé" },
        { status: 403 }
      );
    if (newParent.ownerId !== userId)
      return NextResponse.json(
        { error: "Vous n'avez pas les droits sur le dossier de destination" },
        { status: 403 }
      );
    if (newParentId === itemId)
      return NextResponse.json(
        { error: "Destination invalide" },
        { status: 400 }
      );
    let cursor = newParent as typeof newParent | null;
    while (cursor) {
      if (cursor.id === itemId)
        return NextResponse.json(
          {
            error:
              "Impossible de déplacer un dossier dans l'un de ses sous-dossiers",
          },
          { status: 400 }
        );
      if (!cursor.parentId) break;
      cursor = await prisma.item.findUnique({ where: { id: cursor.parentId } });
    }

    // Vérification qu'un élément avec le même nom n'existe pas déjà dans le dossier de destination
    const existingItem = await prisma.item.findFirst({
      where: {
        name: item.name,
        parentId: newParentId,
        ownerId: userId,
        id: { not: itemId }, // Exclure l'élément actuel de la recherche
      },
    });

    if (existingItem) {
      return NextResponse.json(
        {
          error: `Un ${
            item.isFolder ? "dossier" : "fichier"
          } avec ce nom existe déjà dans le dossier de destination`,
        },
        { status: 409 }
      );
    }

    // Ancienne chaîne d'ancêtres (avant déplacement)
    const oldAncestors: string[] = [];
    let cur: string | null = item.parentId;
    while (cur) {
      const parent: { id: string; parentId: string | null } | null =
        await prisma.item.findUnique({
          where: { id: cur },
          select: { id: true, parentId: true },
        });
      if (!parent) break;
      oldAncestors.push(parent.id);
      cur = parent.parentId;
    }
    // Nouvelle chaîne d'ancêtres (après déplacement)
    const newAncestors: string[] = [];
    let cur2: string | null = newParentId;
    while (cur2) {
      const parent: { id: string; parentId: string | null } | null =
        await prisma.item.findUnique({
          where: { id: cur2 },
          select: { id: true, parentId: true },
        });
      if (!parent) break;
      newAncestors.push(parent.id);
      cur2 = parent.parentId;
    }
    const oldSet = new Set(oldAncestors);
    const newSet = new Set(newAncestors);
    const common = new Set<string>();
    for (const id of oldSet) if (newSet.has(id)) common.add(id);
    const decTargets = [...oldSet].filter((id) => !common.has(id));
    const incTargets = [...newSet].filter((id) => !common.has(id));
    const subtreeSize = item.size; // agrégé si dossier, direct si fichier

    const [updatedItem] = await prisma.$transaction([
      prisma.item.update({
        where: { id: itemId },
        data: { parentId: newParentId },
      }),
      ...(subtreeSize > 0
        ? decTargets.map((id) =>
            prisma.item.update({
              where: { id },
              data: { size: { decrement: subtreeSize } },
            })
          )
        : []),
      ...(subtreeSize > 0
        ? incTargets.map((id) =>
            prisma.item.update({
              where: { id },
              data: { size: { increment: subtreeSize } },
            })
          )
        : []),
    ]);

    return NextResponse.json({
      message: `${item.isFolder ? "Dossier" : "Fichier"} déplacé avec succès`,
      item: {
        id: updatedItem.id,
        name: updatedItem.name,
        isFolder: updatedItem.isFolder,
        parentId: updatedItem.parentId,
      },
    });
  } catch (error) {
    console.error("Erreur lors du déplacement:", error);
    return NextResponse.json(
      { error: "Erreur lors du déplacement de l'élément" },
      { status: 500 }
    );
  }
}
