import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { capitalizeFirstLetter } from "@/lib/helper";
import { v4 as uuidv4 } from "uuid";

const createUserSchema = z.object({
  email: z
    .string()
    .min(1, "Email requis")
    .email("Email invalide")
    .refine((email) => email.endsWith("@eduvaud.ch"), {
      message: "L'email doit être de type @eduvaud.ch",
    }),
  password: z
    .string()
    .min(1, "Mot de passe requis")
    .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

export async function POST(req: NextRequest) {
  console.log("Received request to create user");
  try {
    const body = await req.json();
    const { email, password } = createUserSchema.parse(body);

    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: email },
    });
    if (existingUserByEmail) {
      return NextResponse.json(
        { user: null, message: "Email déjà utilisé" },
        { status: 400 }
      );
    }

    const emailParts = email.split("@");
    if (emailParts.length !== 2 || !emailParts[1].includes(".")) {
      return NextResponse.json(
        { user: null, message: "Email invalide" },
        { status: 400 }
      );
    }

    const firstName = capitalizeFirstLetter(email.split(".")[0]);
    const lastName = capitalizeFirstLetter(email.split(".")[1].split("@")[0]);
    const hashedPassword = await hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          role: "STUDENT",
          grades: [],
        },
      });

      const contentBuffer = Buffer.from("print('Hello world !')", "utf-8");
      const rootFolderId = uuidv4();
      await tx.item.create({
        data: {
          id: rootFolderId,
          name: firstName + " " + lastName,
          isFolder: true,
          ownerId: user.id,
          size: contentBuffer.length,
          canRename: false,
          canDelete: false,
          canMove: false,
          canMoveIn: true,
        },
      });
      await tx.item.create({
        data: {
          id: uuidv4(),
          name: "bienvenue.py",
          isFolder: false,
          parentId: rootFolderId,
          content: contentBuffer,
          size: contentBuffer.length,
          ownerId: user.id,
        },
      });
      await tx.item.create({
        data: {
          id: uuidv4(),
          name: "Exercices",
          isFolder: true,
          parentId: rootFolderId,
          ownerId: user.id,
          size: 0,
          canRename: false,
          canDelete: false,
          canMove: false,
          canMoveIn: false,
        },
      });
      return user; // ensure transaction returns created user
    });

    return NextResponse.json(
      { user: newUser, message: "Utilisateur créé avec succès" },
      { status: 201 }
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    // Gestion des erreurs Zod (validation)
    if (e instanceof ZodError) {
      const firstError = e.issues[0]?.message || "Données invalides.";
      return NextResponse.json({ user: null, message: firstError }, { status: 400 });
    }
    // Autres erreurs (ex: JSON mal formé)
    return NextResponse.json({ user: null, message: e.message || "Erreur inconnue." }, { status: 400 });
  }
}
