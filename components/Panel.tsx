"use client";
import { ReactNode } from "react";

interface PanelProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function Panel({ title, children, actions, className = "" }: PanelProps) {
  return (
    <section className={`rounded-lg border border-zinc-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-700 truncate">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="p-2">
        {children}
      </div>
    </section>
  );
}
