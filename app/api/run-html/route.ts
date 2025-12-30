import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireUserId } from "@/lib/serverAuth";

const MAX_TOTAL_SIZE = 1 * 1024 * 1024; // 1MB (HTML/CSS/JS usually small) adjustable
const MAX_FILES = 300;

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  try {
    const { mainFilePath, files } = await req.json();
    if (!mainFilePath || typeof mainFilePath !== 'string' || !mainFilePath.endsWith('.html')) {
      return NextResponse.json({ error: 'Fichier principal HTML requis (.html)' }, { status: 400 });
    }
    if (!files || typeof files !== 'object') {
      return NextResponse.json({ error: 'Files manquants' }, { status: 400 });
    }
    if (containsTraversal(mainFilePath)) {
      return NextResponse.json({ error: 'Chemin principal invalide' }, { status: 400 });
    }

    const { userId } = auth;
    const runDir = path.join(process.cwd(), 'public', 'runs', userId);
    if (fs.existsSync(runDir)) {
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (e) { console.warn('Failed to clean previous html run dir', e); }
    }
    fs.mkdirSync(runDir, { recursive: true });

    let totalSize = 0;
    let fileCount = 0;

    for (const [relRaw, content] of Object.entries(files) as [string, string][]) {
      fileCount++;
      if (fileCount > MAX_FILES) return NextResponse.json({ error: 'Trop de fichiers' }, { status: 400 });
      const relPath = sanitizeRelativePath(relRaw);
      if (containsTraversal(relPath)) return NextResponse.json({ error: 'Chemin invalide' }, { status: 400 });
      const target = path.join(runDir, relPath);
      if (!target.startsWith(runDir)) return NextResponse.json({ error: 'Chemin hors périmètre' }, { status: 400 });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Treat content as UTF-8 text; (Images/binary non supportés pour l'instant)
      const buf = Buffer.from(content, 'utf-8');
      totalSize += buf.length;
      if (totalSize > MAX_TOTAL_SIZE) return NextResponse.json({ error: 'Taille totale trop grande' }, { status: 400 });
      fs.writeFileSync(target, buf);
    }

    const mainAbs = path.join(runDir, sanitizeRelativePath(mainFilePath));
    if (!fs.existsSync(mainAbs)) return NextResponse.json({ error: 'Fichier principal introuvable' }, { status: 400 });

  return NextResponse.json({ url: `/runs/${userId}/${sanitizeRelativePath(mainFilePath)}` }, { status: 200 });
  } catch (e) {
    console.error('run-html error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function containsTraversal(p: string) { return p.includes('..') || p.includes('\\'); }
function sanitizeRelativePath(p: string) { return p.replace(/^\/+/, '').replace(/\\/g, '/'); }
