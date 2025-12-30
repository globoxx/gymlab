import { requireUserId } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Cette route permet de créer un nouveau fichier ou dossier dans le workspace
export async function POST(request: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    const { name, isFolder, parentId, content, isExercice } = await request.json();

    // Vérification que le dossier parent existe et appartient à l'utilisateur
    if (parentId) {
      const parentItem = await prisma.item.findUnique({
        where: { id: parentId },
      });

      if (!parentItem) {
        return NextResponse.json(
          { error: "Dossier parent introuvable" },
          { status: 404 }
        );
      }

      if (parentItem.ownerId !== userId) {
        return NextResponse.json(
          { error: "Accès non autorisé au dossier parent" },
          { status: 403 }
        );
      }

      if (!parentItem.isFolder) {
        return NextResponse.json(
          { error: "L'élément parent doit être un dossier" },
          { status: 400 }
        );
      }
    }

    // Vérifier si un élément avec le même nom existe déjà dans ce dossier
    const existingItem = await prisma.item.findFirst({
      where: {
        name,
        parentId,
        ownerId: userId,
      },
    });

    if (existingItem) {
      return NextResponse.json(
        {
          error: `Un ${
            isFolder ? "dossier" : "fichier"
          } avec ce nom existe déjà`,
        },
        { status: 409 }
      );
    }

    // Création + propagation taille dans une transaction
    const base64Buf =
      !isFolder && content ? Buffer.from(content, "base64") : null;
    const fileSize = base64Buf ? base64Buf.length : 0;

    const ancestorIds: string[] = [];
    if (parentId && fileSize > 0) {
      // collect ancestors for size increment
      let current: string | null = parentId;
      while (current) {
        const parent = await prisma.item.findUnique({
          where: { id: current },
          select: { id: true, parentId: true },
        });
        if (!parent) break;
        ancestorIds.push(parent.id);
        current = parent.parentId;
      }
    }

    const [newItem] = await prisma.$transaction([
      prisma.item.create({
        data: {
          id: uuidv4(),
          name,
          isFolder,
          parentId,
          ownerId: userId,
          content: isFolder ? null : base64Buf,
          size: isFolder ? 0 : fileSize,
          canRename: isExercice ? false : true,
          canDelete: isExercice ? false : true,
          canMove: isExercice ? false : true,
          canMoveIn: isExercice ? false : true,
        },
      }),
      ...(fileSize > 0
        ? ancestorIds.map((aid) =>
            prisma.item.update({
              where: { id: aid },
              data: { size: { increment: fileSize } },
            })
          )
        : []),
    ]);

    return NextResponse.json(
      {
        message: `${isFolder ? "Dossier" : "Fichier"} créé avec succès`,
        item: {
          id: newItem.id,
          name: newItem.name,
          isFolder: newItem.isFolder,
          parentId: newItem.parentId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur lors de la création:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'élément" },
      { status: 500 }
    );
  }
}
