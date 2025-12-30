/// <reference lib="webworker" />
// Lint worker: { id, code, filename } -> diagnostics
// HTML: htmlhint, CSS: css-tree, JS: mini règles, Python: Ruff WASM

import { HTMLHint } from 'htmlhint';
import * as csstree from 'css-tree';

// --- Ruff WASM ---
import initRuff, { Workspace } from '@astral-sh/ruff-wasm-web';
import type { Diagnostic } from '../types/lint';

// Contexte dédié worker (éviter (self as any))
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let BASE_URL = '';
let WASM_PATH = '/vendor/ruff/ruff_wasm_bg.wasm'; // défaut

let ruffReady = false;
async function ensureRuff() {
    if (ruffReady) return;
    // Autoriser un wasmPath absolu sans BASE_URL
    const isAbsolute = /^(https?:)?\/\//.test(WASM_PATH);
    if (!isAbsolute && !BASE_URL) {
        throw new Error('Ruff: BASE_URL non défini (envoyer op="config" depuis le main thread)');
    }
    const absUrl = isAbsolute ? WASM_PATH : new URL(WASM_PATH, BASE_URL).toString();
    await initRuff(absUrl);   // init = export par défaut (web target)
    ruffReady = true;
}

// Types simples pour le protocole
interface RequestMsg { id: number; code: string; filename?: string | null }

// ----------------- JS -----------------
function jsDiagnostics(code: string): Diagnostic[] {
    const diags: Diagnostic[] = [];
    // naive unused var
    const varRegex = /(const|let|var)\s+([a-zA-Z_$][\w$]*)/g;
    const seen: Record<string, { pos: number }> = {};
    let m: RegExpExecArray | null;
    while ((m = varRegex.exec(code))) {
        const name = m[2];
        const namePos = m.index + m[0].lastIndexOf(name);
        seen[name] = { pos: namePos };
    }
    for (const name of Object.keys(seen)) {
        const occurrences = code.split(name).length - 1;
        if (occurrences === 1) {
            diags.push({ from: seen[name].pos, to: seen[name].pos + name.length, message: `Variable '${name}' non utilisée`, severity: 'warning' });
        }
    }
    // == vs === (très simplifié)
    let idx = code.indexOf('==');
    while (idx !== -1) {
        if (code.slice(idx, idx + 3) !== '===') {
            diags.push({ from: idx, to: idx + 2, message: "Utiliser '===' (égalité stricte)", severity: 'warning' });
        }
        idx = code.indexOf('==', idx + 2);
    }
    return diags;
}

// ----------------- HTML -----------------
function htmlDiagnostics(code: string): Diagnostic[] {
    const rules = HTMLHint.defaultRuleset;
    type HTMLHintReport = {
        line: number;
        col?: number;
        message: string;
        type: 'error' | 'warning' | string;
    };
    const res = HTMLHint.verify(code, rules) as HTMLHintReport[];
    return res.map((r) => ({
        from: r.col ? positionToOffset(code, r.line, r.col) : 0,
        to: r.col ? positionToOffset(code, r.line, (r.col ?? 1) + 1) : 0,
        message: r.message,
        severity: r.type === 'error' ? 'error' : 'warning'
    }));
}

// ----------------- CSS -----------------
function cssDiagnostics(code: string): Diagnostic[] {
    const diags: Diagnostic[] = [];
    try {
        csstree.parse(code, {
            positions: true,
            onParseError: (err: unknown) => {
                const e = err as { loc?: { start: { offset: number } }; message?: string } | undefined;
                const hasMsg = (x: unknown): x is { message?: string } => typeof x === 'object' && x !== null && 'message' in (x as Record<string, unknown>);
                if (e?.loc?.start?.offset !== undefined) {
                    const off = e.loc.start.offset;
                    diags.push({ from: off, to: off + 1, message: e?.message ?? 'CSS parse error', severity: 'error' });
                } else {
                    const msg = hasMsg(err) && typeof err.message === 'string' ? err.message : 'CSS parse error';
                    diags.push({ from: 0, to: 0, message: msg, severity: 'error' });
                }
            }
        });
    } catch {
        // erreurs déjà reportées via onParseError
    }
    return diags;
}

// ----------------- PYTHON (Ruff) -----------------
// --- helpers pour convertir un diag Ruff vers offsets CM ---
type RuffLoc = { row: number; column: number };
type RuffDiag = {
  code?: string;
  message: string;
    start_location?: RuffLoc;     // clé attendue
    end_location?: RuffLoc;       // clé attendue
    // sauvegarde pour d'anciennes versions:
    location?: RuffLoc;
    endLocation?: RuffLoc;
  // facultatif: fix?: { edits: Array<{ location: RuffLoc; end_location: RuffLoc; content?: string }> }
};

// Si Ruff renvoie un range vide, on étend à ~1 token pour que CM affiche un souligné net
function expandToToken(text: string, from: number): number {
  const isWord = (ch: string) => /\w/.test(ch);
  let i = from;
  if (i < text.length && isWord(text[i])) {
    while (i < text.length && isWord(text[i])) i++;
    return i;
  }
  const stop = text.slice(i).search(/[\s\W]/);
  return stop > 0 ? i + stop : Math.min(i + 1, text.length);
}

function pythonDiagnosticsWithRuff(code: string) {
  const workspace = new Workspace({
    'line-length': 88,
    'indent-width': 4,
    format: { 'indent-style': 'space', 'quote-style': 'double' },
    lint: { select: ['E4', 'E7', 'E9', 'F', 'I'] },
  });

  const raw = workspace.check(code) as RuffDiag[];

  return raw.map((d) => {
        const start = d.start_location ?? d.location;
        const end = d.end_location ?? d.endLocation ?? d.start_location ?? d.location;
        if (!start || !end) {
            return { from: 0, to: 0, message: d.message, severity: 'error' as const };
        }
        const from = positionToOffset(code, start.row, start.column);
        let to = positionToOffset(code, end.row, end.column);
    if (to <= from) to = expandToToken(code, from); // garde-fou

    // Dans le playground, tout est marqué en "Error" côté Monaco; on peut garder 'error'
    // ou dégrader quelques codes en 'warning' si tu veux.
    const severity: 'error' | 'warning' = d.code?.startsWith('E9') ? 'error' : 'error';

    const message = d.code ? `${d.code}: ${d.message}` : d.message;
    return { from, to, message, severity };
  });
}

// util 1-based (ligne/colonne) -> offset
function positionToOffset(text: string, line: number, col: number): number {
  const lines = text.split(/\r?\n/);
  const L = Math.max(1, Math.min(line, lines.length));
  const before = L <= 1 ? 0 : lines.slice(0, L - 1).reduce((a, s) => a + s.length + 1, 0);
  const target = lines[L - 1] ?? "";
  const C = Math.max(1, Math.min(col, target.length + 1));
  return before + (C - 1);
}

// --- message loop (juste 2 lignes ajoutées: warmup + ensureRuff) ---
ctx.onmessage = async (e: MessageEvent<RequestMsg & { op?: 'config' | 'warmup'; baseUrl?: string; wasmPath?: string }>) => {
    const { id, code, filename, op, baseUrl, wasmPath } = e.data;

    try {
        // 1) Messages de contrôle (ne pas lancer de lint)
        if (op === 'config') {
            if (typeof baseUrl === 'string') BASE_URL = baseUrl;
            if (typeof wasmPath === 'string') WASM_PATH = wasmPath;
            // Pas de réponse nécessaire, mais ok si tu veux accuser réception
            return;
        }
        if (op === 'warmup') {
            await ensureRuff();
            ctx.postMessage({ id, diagnostics: [] });
            return;
        }

        // 2) Lint normal
        const lower = (filename || '').toLowerCase();
        let diagnostics: Diagnostic[] = [];

        if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
            diagnostics = jsDiagnostics(code);
        } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
            diagnostics = htmlDiagnostics(code);
        } else if (lower.endsWith('.css')) {
            diagnostics = cssDiagnostics(code);
        } else if (lower.endsWith('.py') || !filename) {
            await ensureRuff();
            diagnostics = pythonDiagnosticsWithRuff(code);
        }

    ctx.postMessage({ id, diagnostics });
    } catch (err) {
        // utile en dev
        console.error('[lintWorker] Error:', err);
    ctx.postMessage({ id, diagnostics: [] });
    }
};