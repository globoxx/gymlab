"use client";
import { useSession, signIn, signOut } from "next-auth/react";

export default function NavAuthButton() {
  const { data: session, status } = useSession();
  const loading = status === 'loading';
  if (loading) {
    return <div className="text-xs text-zinc-400">...</div>;
  }
  if (!session) {
    return (
      <button
        onClick={() => signIn(undefined, { callbackUrl: '/' })}
        className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors text-sm"
      >Connexion</button>
    );
  }
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="px-3 py-1.5 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium transition-colors text-sm"
    >Déconnexion</button>
  );
}
