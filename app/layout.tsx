import "./globals.css";
import Script from "next/script";
import Link from "next/link";
import React from "react";
import Image from "next/image";
import NavAuthButton from "@/components/NavAuthButton";
import ProfileNavLink from "@/components/ProfileNavLink";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import SidebarSections, { SectionDef } from "@/components/SidebarSections";

export const metadata = {
  title: "Plateforme Python éducative",
  description: "Environnement d’apprentissage interactif",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head />
      <body className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans antialiased">
        {/* Skulpt core (no jQuery needed) */}
        <Script src="/skulpt/skulpt.min.js" strategy="beforeInteractive" />
        <Script src="/skulpt/skulpt-stdlib.js" strategy="beforeInteractive" />
        {/* Top navigation bar */}
        <SessionProviderWrapper>
          <header className="w-full border-b border-neutral-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 shadow-sm">
            <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <Link href="/" className="flex items-center font-semibold text-xl tracking-tight text-purple-700 hover:text-purple-600 transition-colors">
                  <Image src="/logo.svg" alt="Logo" width={200} height={200} className="mr-2" />
                </Link>
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                  <Link href="/" className="text-neutral-600 hover:text-purple-600 transition-colors">Accueil</Link>
                  <ProfileNavLink />
                </nav>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <NavAuthButton />
              </div>
            </div>
          </header>
          <div className="flex flex-1 w-full overflow-hidden">
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col w-72 border-r border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <div className="px-6 pt-6 pb-3">
                <h2 className="text-2xl font-semibold text-purple-700 leading-tight">Travaux pratiques</h2>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-8">
                <SidebarSections sections={SECTIONS} numbered />
              </div>
            </aside>
            {/* Main content area */}
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full px-8 py-10">
                {children}
              </div>
            </main>
          </div>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
const SECTIONS: SectionDef[] = [
  {
    title: 'Introduction', items: [
  { label: 'Bienvenue', href: '/courses/aventure' },
      { label: 'Prérequis', href: '#intro-prerequis' },
      { label: 'Installation', href: '#intro-installation' }
    ]
  },
  {
    title: 'Python', items: [
      { label: 'Variables', href: '#py-variables' },
      { label: 'Conditions', href: '#py-conditions' },
      { label: 'Boucles', href: '#py-boucles' },
      { label: 'Fonctions', href: '#py-fonctions' }
    ]
  },
  {
    title: 'HTML & Web', items: [
      { label: 'Structure HTML', href: '#web-structure' },
      { label: 'CSS de base', href: '#web-css' },
      { label: 'JavaScript intro', href: '#web-js' }
    ]
  },
  {
    title: 'Projets', items: [
      { label: 'Mini-jeu', href: '#proj-game' },
      { label: 'Site statique', href: '#proj-site' }
    ]
  }
];
