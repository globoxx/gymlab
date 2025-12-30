"use client";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function ProfileNavLink() {
  const { data: session, status } = useSession();
  if (status === "loading") return null;
  if (!session) return null;
  return (
    <Link
      href="/profil"
      className="text-neutral-600 hover:text-purple-600 transition-colors"
    >
      Profil
    </Link>
  );
}
