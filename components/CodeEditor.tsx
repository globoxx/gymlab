'use client'

import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { useEffect, useMemo, useRef } from 'react'
import { linter, Diagnostic as CMDiagnostic, lintGutter } from '@codemirror/lint'
import type { Diagnostic } from '../types/lint'

interface EditorProps {
  code: string
  filename?: string | null
  onChange: (val: string) => void
}

const sizeAndScrollTheme = EditorView.theme({
  '&': { height: 'auto' },
  '.cm-scroller': {
    maxHeight: '600px',
    overflowY: 'auto',
    overflowX: 'auto',
  },
})

// Accentuer fortement les erreurs et avertissements
const diagnosticsTheme = EditorView.theme({
  '.cm-diagnostic': {
    fontSize: '0.80rem'
  },
  '.cm-diagnostic.cm-diagnostic-error': {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderLeft: '4px solid #dc2626',
    padding: '2px 4px',
    margin: '2px 0'
  },
  '.cm-diagnostic.cm-diagnostic-warning': {
    backgroundColor: 'rgba(234,179,8,0.20)',
    borderLeft: '4px solid #d97706',
    padding: '2px 4px',
    margin: '2px 0'
  },
  '.cm-lineDiagnostics': {
    // container under a line when inline messages enabled
  },
  '.cm-gutter-lint': {
    width: '14px'
  },
  '.cm-lintPoint-error': {
    background: '#dc2626',
    borderRadius: '50%',
    width: '10px',
    height: '10px'
  },
  '.cm-lintPoint-warning': {
    background: '#d97706',
    borderRadius: '50%',
    width: '10px',
    height: '10px'
  },
  '.cm-selectionLayer .cm-selectionBackground': {
    background: 'rgba(147,197,253,0.35)'
  }
}, { dark: false })

// Decoration overlays (underlines) via built-in CSS classes
const diagnosticStyles = EditorView.baseTheme({
  '.cm-diagnosticRange.cm-diagnostic-error': {
    background: 'rgba(239,68,68,0.45) !important',
    boxShadow: '0 0 0 1px #dc2626 inset, 0 0 0 2px rgba(220,38,38,0.35)',
    outline: '2px solid rgba(220,38,38,0.55)',
    borderRadius: '3px',
    textDecoration: 'none'
  },
  '.cm-diagnosticRange.cm-diagnostic-warning': {
    background: 'rgba(234,179,8,0.55) !important',
    boxShadow: '0 0 0 1px #d97706 inset, 0 0 0 2px rgba(217,119,6,0.45)',
    outline: '2px solid rgba(217,119,6,0.55)',
    borderRadius: '3px',
    textDecoration: 'none'
  }
})

export default function CodeEditor({ code, filename, onChange }: EditorProps) {
  const workerRef = useRef<Worker | null>(null)
  const pendingReq = useRef<number>(0)

  // Create/cleanup worker in an effect (avoids duplicate workers in StrictMode)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const w = new Worker(new URL('./lintWorker.ts', import.meta.url), { type: 'module' })
      workerRef.current = w

      // Compute wasmPath with optional basePath (NEXT_PUBLIC_BASE_PATH) if provided
      const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
      const wasmPath = `${basePath}/vendor/ruff/ruff_wasm_bg.wasm` || '/vendor/ruff/ruff_wasm_bg.wasm'

      w.postMessage({
        op: 'config',
        baseUrl: window.location.origin,
        wasmPath,
      })

      w.postMessage({ id: -1, op: 'warmup', filename: 'warmup.py', code: 'print(0)' })
    } catch (e) {
      console.warn('Lint worker non initialisé', e)
    }
    return () => {
      try { workerRef.current?.terminate() } catch {}
      workerRef.current = null
    }
  }, [])

  const cmLinter = useMemo(() => {
    return linter(async (view) => {
      const w = workerRef.current;
      if (!w) return [] as CMDiagnostic[];
      return new Promise<CMDiagnostic[]>(resolve => {
        const id = ++pendingReq.current;
        const timer = setTimeout(() => {
          console.warn('Lint worker timeout, no response received')
          w.removeEventListener('message', handler)
          resolve([])
        }, 12000)
        const handler = (ev: MessageEvent) => {
          if (ev.data && ev.data.id === id) {
            w.removeEventListener('message', handler);
            clearTimeout(timer)
            const diagnostics = (ev.data.diagnostics || []).map((d: Diagnostic) => ({
              from: d.from, to: d.to, message: d.message, severity: d.severity
            }));
            resolve(diagnostics);
          }
        };
        w.addEventListener('message', handler);
        w.postMessage({ id, code: view.state.doc.toString(), filename });
      });
    }, { delay: 350 });
  }, [filename]);
  const languageExt = useMemo(() => {
    if (!filename) return python()
    const lower = filename.toLowerCase()
    if (lower.endsWith('.py')) return python()
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return html()
    if (lower.endsWith('.css')) return css()
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return javascript()
    return python() // default fallback
  }, [filename])
  return (
    <div className="w-full">
      <CodeMirror
        value={code}
        basicSetup={{ lineNumbers: true }}
        height="auto"
        style={{ width: '100%' }}
        extensions={[languageExt, sizeAndScrollTheme, diagnosticsTheme, diagnosticStyles, lintGutter(), cmLinter]}
        onChange={(val) => onChange(val)}
        theme="light"
      />
    </div>
  )
}
