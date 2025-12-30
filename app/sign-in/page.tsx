'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (res?.error) {
      setError('Email ou mot de passe incorrect');
    } else {
      router.push('/'); // Redirige vers l’IDE après connexion
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <h1 className="text-xl font-bold mb-4">Connexion</h1>
        {error && <p className="text-red-500 mb-2">{error}</p>}
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
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
        >
          Se connecter
        </button>
        <p className="mt-4 text-center">
          Pas encore de compte ? <a href="/sign-up" className="text-blue-600 hover:underline">Créer un compte</a>
        </p>
      </form>
    </main>
  );
}
