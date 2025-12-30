import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function middleware(req: any) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // Autoriser l'accès à ces routes sans session
  const publicPaths = ["/sign-in", "/sign-up", "/api/auth", "/api/user", "/_next", "/favicon.ico"];

  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Si pas de token et route protégée → rediriger vers /sign-in
  if (!token) {
    const loginUrl = new URL("/sign-in", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Appliquer le middleware à toutes les pages (sauf fichiers statiques)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
