import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function ProfilPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return <div className="p-8">Veuillez vous connecter.</div>;
  }
  const user = session.user;
  return (
    <div className="max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold text-purple-700">Profil</h1>
      <div className="space-y-2 text-sm">
        <p><span className="font-medium">Email:</span> {user.email}</p>
        {user.firstName || user.lastName ? (
          <p><span className="font-medium">Nom:</span> {user.firstName} {user.lastName}</p>
        ) : null}
        {user.role && <p><span className="font-medium">Rôle:</span> {user.role}</p>}
      </div>
    </div>
  );
}
