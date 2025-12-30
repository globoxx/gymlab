'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    console.log("Response from user creation:", res);

    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Erreur lors de la création du compte');
      return;
    }

    setSuccess('Compte créé ! Connexion en cours...');
    // Connexion automatique
    await signIn('credentials', { email, password, redirect: false });
    router.push('/'); // Redirige vers l’IDE
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 w-96">
        <h1 className="text-xl font-bold mb-4">Créer un compte</h1>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {success && <p className="text-green-600 mb-4">{success}</p>}
        <label className="block mb-2">Email :</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 w-full mb-4"
          placeholder="prenom.nom@eduvaud.ch"
        />
        <label className="block mb-2">Mot de passe :</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 w-full mb-4"
          placeholder="••••••••"
        />
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full"
        >
          Créer un compte
        </button>
        <p className="mt-4 text-center">
          Déjà inscrit ? <a href="/sign-in" className="text-blue-600 hover:underline">Se connecter</a>
        </p>
      </form>
    </main>
  );
}
