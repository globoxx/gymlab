import { requireUserId } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Cette route permet de renommer un fichier ou dossier
export async function PATCH(request: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  
  try {
    const { id, newName } = await request.json();
    
    if (!id || !newName) {
      return NextResponse.json({ error: "ID ou nouveau nom manquant" }, { status: 400 });
    }
    
    // Vérification que l'élément existe et appartient à l'utilisateur
    const item = await prisma.item.findUnique({
      where: { id }
    });
    
    if (!item) {
      return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
    }

    if (item.canRename === false) {
      return NextResponse.json(
        { error: "Renommage de cet élément non autorisé" },
        { status: 403 }
      );
    }

    if (item.ownerId !== userId) {
      return NextResponse.json({ error: "Vous n'avez pas les droits pour modifier cet élément" }, { status: 403 });
    }
    
    // Vérification qu'un élément avec le même nom n'existe pas déjà dans le même dossier parent
    const existingItem = await prisma.item.findFirst({
      where: {
        name: newName,
        parentId: item.parentId,
        ownerId: userId,
        id: { not: id } // Exclure l'élément actuel de la recherche
      }
    });
    
    if (existingItem) {
      return NextResponse.json(
        { error: `Un ${item.isFolder ? "dossier" : "fichier"} avec ce nom existe déjà` }, 
        { status: 409 }
      );
    }
    
    // Mise à jour du nom de l'élément
    const updatedItem = await prisma.item.update({
      where: { id },
      data: { name: newName }
    });
    
    return NextResponse.json({ 
      message: `${item.isFolder ? "Dossier" : "Fichier"} renommé avec succès`,
      item: {
        id: updatedItem.id,
        name: updatedItem.name,
        isFolder: updatedItem.isFolder,
        parentId: updatedItem.parentId
      }
    });
    
  } catch (error) {
    console.error("Erreur lors du renommage:", error);
    return NextResponse.json({ error: "Erreur lors du renommage de l'élément" }, { status: 500 });
  }
}
