import { requireUserId } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Cette route permet de supprimer un fichier ou dossier et tous ses enfants
// Prend un objet JSON {id: string} en entrée
export async function DELETE(request: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    // Récupération de l'ID de l'élément à supprimer depuis le corps de la requête
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "ID de l'élément manquant" },
        { status: 400 }
      );
    }

    // Vérification que l'élément appartient bien à l'utilisateur
    const item = await prisma.item.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Élément introuvable" },
        { status: 404 }
      );
    }

    if (item.ownerId !== userId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour supprimer cet élément" },
        { status: 403 }
      );
    }

    // Interdire suppression du dossier racine
    if (item.parentId === null) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dossier racine" },
        { status: 400 }
      );
    }

    if (item.canDelete === false) {
      return NextResponse.json(
        { error: "Suppression de cet élément non autorisée" },
        { status: 403 }
      );
    }

    // Récupération récursive de tout le sous-arbre (BFS)
    const toVisit: string[] = [item.id];
    const subtreeItems: { id: string; isFolder: boolean; size: number }[] = [];
    while (toVisit.length) {
      const batchIds = toVisit.splice(0, 25); // limiter requêtes
      const nodes = await prisma.item.findMany({
        where: { id: { in: batchIds }, ownerId: userId },
      });
      for (const n of nodes) {
        subtreeItems.push({ id: n.id, isFolder: n.isFolder, size: n.size });
        if (n.isFolder) {
          const children = await prisma.item.findMany({
            where: { parentId: n.id, ownerId: userId },
            select: { id: true },
          });
          toVisit.push(...children.map((c) => c.id));
        }
      }
    }
    // La taille à soustraire des ancêtres correspond à la taille agrégée du nœud racine supprimé
    const removalSize = item.size; // agrégé si dossier (déjà maintenu), taille directe si fichier

    // Collecte ancêtres pour décrémenter la taille
    const ancestorIds: string[] = [];
    let parentId: string | null = item.parentId;
    while (parentId) {
      const parent: { id: string; parentId: string | null } | null =
        await prisma.item.findUnique({
          where: { id: parentId },
          select: { id: true, parentId: true },
        });
      if (!parent) break;
      ancestorIds.push(parent.id);
      parentId = parent.parentId;
    }

    const fileIds = subtreeItems.filter((i) => !i.isFolder).map((i) => i.id);
    const folderIds = subtreeItems.filter((i) => i.isFolder).map((i) => i.id);

    await prisma.$transaction([
      ...(removalSize > 0
        ? ancestorIds.map((aid) =>
            prisma.item.update({
              where: { id: aid },
              data: { size: { decrement: removalSize } },
            })
          )
        : []),
      prisma.item.deleteMany({ where: { id: { in: fileIds } } }),
      prisma.item.deleteMany({ where: { id: { in: folderIds } } }),
    ]);

    return NextResponse.json({
      message: item.isFolder
        ? "Dossier et contenu supprimés avec succès"
        : "Fichier supprimé avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'élément" },
      { status: 500 }
    );
  }
}
