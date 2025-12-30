import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { requireUserId } from "@/lib/serverAuth";

// Basic constraints
const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_FILES = 200;
const MAIN_FILE_NAME = "main.py";

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const { userId } = auth;
  const { mainFilePath, files } = await req.json();
  if (!mainFilePath || !files || typeof files !== "object") {
    return NextResponse.json({ error: "Missing files or mainFile" }, { status: 400 });
  }
  if (!mainFilePath.endsWith(`/${MAIN_FILE_NAME}`) && !mainFilePath.endsWith(MAIN_FILE_NAME)) {
    return NextResponse.json({ error: `Le fichier principal doit être '${MAIN_FILE_NAME}'` }, { status: 400 });
  }
  if (containsTraversal(mainFilePath)) {
    return NextResponse.json({ error: "Chemin principal invalide" }, { status: 400 });
  }

  // Single run directory per user: overwrite old run
  const runDir = path.join(process.cwd(), "public", "runs", userId);
  try {
    // Remove previous run (if any) to avoid stale assets
    if (fs.existsSync(runDir)) {
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (e) { console.warn('Failed to clean previous pygame run dir', e); }
    }
    fs.mkdirSync(runDir, { recursive: true });
    let totalSize = 0;
    let fileCount = 0;
    for (const [relPathRaw, content] of Object.entries(files) as [string, string][]) {
      fileCount++;
      if (fileCount > MAX_FILES) return NextResponse.json({ error: "Trop de fichiers" }, { status: 400 });
      if (typeof content !== "string") return NextResponse.json({ error: "Format de fichier invalide" }, { status: 400 });
      const relPath = sanitizeRelativePath(relPathRaw);
      if (containsTraversal(relPath)) return NextResponse.json({ error: "Chemin de fichier invalide" }, { status: 400 });
      const targetPath = path.join(runDir, relPath);
      if (!targetPath.startsWith(runDir)) return NextResponse.json({ error: "Chemin hors du répertoire autorisé" }, { status: 400 });
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      let buffer: Buffer;
      if (looksBase64(content)) {
        try { buffer = Buffer.from(content, "base64"); } catch { return NextResponse.json({ error: "Encodage base64 invalide" }, { status: 400 }); }
      } else {
        buffer = Buffer.from(content, "utf-8");
      }
      totalSize += buffer.length;
      if (totalSize > MAX_TOTAL_SIZE) return NextResponse.json({ error: "Taille totale des fichiers trop grande" }, { status: 400 });
      fs.writeFileSync(targetPath, buffer);
    }
    const mainAbs = path.join(runDir, sanitizeRelativePath(mainFilePath));
    if (!fs.existsSync(mainAbs)) return NextResponse.json({ error: "Fichier principal introuvable" }, { status: 400 });
    const mainFileDir = path.dirname(sanitizeRelativePath(mainFilePath));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const result: { url?: string; error?: string } = await new Promise((resolve) => {
      const proc = spawn("pygbag", ["--build", MAIN_FILE_NAME], { cwd: path.join(runDir, mainFileDir), stdio: "inherit", signal: controller.signal as unknown as AbortSignal });
      proc.on("error", (err) => { console.error("Pygbag spawn error", err); resolve({ error: "Erreur d'exécution" }); });
      proc.on("exit", (code) => { clearTimeout(timeout); if (code !== 0) resolve({ error: "Compilation échouée" }); else resolve({ url: `/runs/${userId}/${mainFileDir}/build/web/index.html` }); });
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ url: result.url }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function looksBase64(str: string) { if (!str || /[^A-Za-z0-9+/=]/.test(str) || str.length % 4 !== 0) return false; return true; }
function containsTraversal(p: string) { return p.includes("..") || p.includes("\\"); }
function sanitizeRelativePath(p: string) { return p.replace(/^\/+/g, "").replace(/\\/g, "/"); }
