"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface SectionDef { title: string; items: { label: string; href: string }[] }

interface Props { sections: SectionDef[]; numbered?: boolean }

export default function SidebarSections({ sections, numbered }: Props) {
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    const ids = sections.flatMap(s => s.items.map(i => i.href.startsWith('#') ? i.href.substring(1) : null).filter(Boolean)) as string[];
    const observers: IntersectionObserver[] = [];

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#','');
      if (hash) setActive('#'+hash);
    };
    window.addEventListener('hashchange', handleHashChange);

    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActive('#'+e.target.id);
        });
      }, { rootMargin: '0px 0px -60% 0px', threshold: 0.2 });
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) obs.observe(el);
      });
      observers.push(obs);
    }
    handleHashChange();
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      observers.forEach(o => o.disconnect());
    };
  }, [sections]);

  return (
    <div className="space-y-8">
      {sections.map(sec => (
        <div key={sec.title} className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{sec.title}</h3>
          <ul className="space-y-1.5">
            {sec.items.map((it, idx) => {
              const href = it.href;
              const isActive = active === href;
              return (
                <li key={href}>
                  <Link href={href} className={
                    'group flex items-start gap-2 rounded px-2 py-1.5 text-sm transition-colors ' +
                    (isActive ? 'bg-purple-100 text-purple-700 font-medium ring-1 ring-purple-300' : 'text-neutral-700 hover:text-purple-700 hover:bg-purple-50')
                  }>
                    {numbered && (
                      <span className={
                        'w-5 text-right tabular-nums shrink-0 ' +
                        (isActive ? 'text-purple-600' : 'text-neutral-400 group-hover:text-purple-500')
                      }>{idx + 1}.</span>
                    )}
                    <span className="flex-1 leading-snug">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
