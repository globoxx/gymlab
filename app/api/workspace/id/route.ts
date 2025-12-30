import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/serverAuth";
import type { Prisma } from "@prisma/client";

// GET /api/workspace/id
// Trouver l'id d'un item unique du workspace de l'utilisateur connecté
// Critères supportés (query string):
// - name: nom exact de l'item (ex: "main.py")
// - isFolder: "true" | "false" (optionnel)
// - canDelete: "true" | "false" (optionnel)
export async function GET(req: NextRequest) {
	const auth = await requireUserId();
	if ("response" in auth) return auth.response;
	const { userId } = auth;

	const sp = req.nextUrl.searchParams;
	const name = sp.get("name")?.trim();
	const isFolderStr = sp.get("isFolder");
	const canDeleteStr = sp.get("canDelete");

	const parseBool = (v: string | null) =>
		v == null
			? undefined
			: v.toLowerCase() === "true"
			? true
			: v.toLowerCase() === "false"
			? false
			: ("__invalid__" as const);

	const isFolder = parseBool(isFolderStr);
	const canDelete = parseBool(canDeleteStr);

	if (isFolder === "__invalid__" || canDelete === "__invalid__") {
		return NextResponse.json(
			{ error: "Paramètre booléen invalide (isFolder/canDelete doivent être 'true' ou 'false')" },
			{ status: 400 }
		);
	}

	if (!name && typeof isFolder === "undefined" && typeof canDelete === "undefined") {
		return NextResponse.json(
			{ error: "Aucun critère fourni (attendus: name, isFolder, canDelete)" },
			{ status: 400 }
		);
	}

	const where: Prisma.ItemWhereInput = { ownerId: userId };
	if (name) where.name = name;
	if (typeof isFolder !== "undefined") where.isFolder = isFolder;
	if (typeof canDelete !== "undefined") where.canDelete = canDelete;

	const results = await prisma.item.findMany({ where, select: { id: true } });
	if (results.length === 0) return NextResponse.json({ error: "Aucun élément ne correspond" }, { status: 404 });
	if (results.length > 1)
		return NextResponse.json(
			{ error: "Plusieurs éléments correspondent, précisez davantage les critères" },
			{ status: 409 }
		);

	return NextResponse.json({ id: results[0].id }, { status: 200 });
}