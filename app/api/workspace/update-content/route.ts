import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/serverAuth";

// Cette route permet de mettre à jour le contenu d'un fichier
export async function PATCH(request: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    const { id, content } = await request.json();
    if (!id || content === undefined) {
      return NextResponse.json({ error: "ID ou contenu manquant" }, { status: 400 });
    }

    // Vérification que le fichier existe et appartient à l'utilisateur
    const file = await prisma.item.findUnique({
      where: { id },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Fichier introuvable" },
        { status: 404 }
      );
    }

    if (file.ownerId !== userId) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour modifier ce fichier" },
        { status: 403 }
      );
    }

    if (file.isFolder) {
      return NextResponse.json(
        { error: "Impossible de mettre à jour le contenu d'un dossier" },
        { status: 400 }
      );
    }

    const newContentBuf = Buffer.from(content, "base64");
    const oldSize = file.content ? file.content.length : 0;
    const sizeDiff = newContentBuf.length - oldSize;
    const ancestorIds: string[] = [];
    let parentId = file.parentId;
    while (parentId) {
      const parent = await prisma.item.findUnique({ where: { id: parentId } });
      if (!parent) break;
      ancestorIds.push(parent.id);
      parentId = parent.parentId;
    }
    const [updatedFile] = await prisma.$transaction([
      prisma.item.update({ where: { id }, data: { content: newContentBuf, size: newContentBuf.length } }),
      ...ancestorIds.map((aid) => prisma.item.update({ where: { id: aid }, data: { size: { increment: sizeDiff } } })),
    ]);

    return NextResponse.json({
      message: "Fichier mis à jour avec succès",
      file: {
        id: updatedFile.id,
        name: updatedFile.name,
        parentId: updatedFile.parentId,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du fichier:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du fichier" },
      { status: 500 }
    );
  }
}
