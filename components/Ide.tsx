"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Console from "@/components/Console";
import PygbagFrame from "@/components/PygbagFrame";
import Panel from "@/components/Panel";
import { runSkulpt, type SkulptIO } from "@/utils/skulptRunner";
import { ITreeObjDir, ITreeObjFile } from "@/types/fileExplorer";
import FileExplorer from "@/components/explorer/FileExplorer";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
});

export default function Ide({
  exerciceName,
  defaultContent,
}: {
  exerciceName?: string | null;
  defaultContent?: string | null;
}) {
  const [output, setOutput] = useState<string>("");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [needsCanvas, setNeedsCanvas] = useState(false);
  const runIdRef = useRef(0);
  const [runCounter, setRunCounter] = useState(0);

  // Resizable sidebar state
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [editorHeight, setEditorHeight] = useState<number>(0);

  const [workspace, setWorkspace] = useState<ITreeObjDir | null>(null);
  const [selectedFile, setSelectedFile] = useState<ITreeObjFile | null>(null);
  const [selectedDirId, setSelectedDirId] = useState<string | null>(null);

  // Debounce save timer id
  const saveTimeoutRef = useRef<number | null>(null);
  // Path complet du fichier sélectionné (pour éviter collisions de noms)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  // Upload (multi-fichiers / dossiers)
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  // Helpers base64 sans dépendre de Buffer
  const encodeBase64 = useCallback((str: string) => {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch {
      return "";
    }
  }, []);
  const decodeBase64 = useCallback((b64: string) => {
    try {
      return decodeURIComponent(escape(atob(b64)));
    } catch {
      return "";
    }
  }, []);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [inputPrompt, setInputPrompt] = useState("");
  const inputResolverRef = useRef<{
    resolve: (v: string) => void;
    reject: (err: unknown) => void;
  } | null>(null);
  const CANCELLED = useRef(Symbol("INPUT_CANCELLED"));

  // Cleanup on unmount: clear pending save debounce and reject input prompt
  useEffect(() => {
    const cancelToken = CANCELLED.current;
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (inputResolverRef.current?.reject) {
        try {
          inputResolverRef.current.reject(cancelToken);
        } catch {}
      }
      inputResolverRef.current = null;
      setAwaitingInput(false);
      setInputPrompt("");
    };
  }, []);

  // Charger le workspace de l'utilisateur connecté
  useEffect(() => {
    async function fetchWorkspace() {
      if (exerciceName) {
        // On récupère l'ID du dossier d'exercice
        const respId = await fetch(
          `/api/workspace/id?name=${encodeURIComponent(
            exerciceName
          )}&isFolder=true&canDelete=false`
        );
        const dataId = await respId.json();
        if (!dataId.error) {
          // Le dossier d'exercice existe déjà
          const folderId = dataId.id;
          // On récupère le workspace à partir du dossier
          const respWorkspace = await fetch(
            `/api/workspace?id=${encodeURIComponent(folderId)}`
          );
          const dataWorkspace = await respWorkspace.json();
          if (!dataWorkspace.error) {
            setWorkspace(dataWorkspace.workspace);
          }
        } else if (dataId.error === "Aucun élément ne correspond") {
          // Le dossier d'exercice n'existe pas, on récupère le parent
          const parentId = (
            await (
              await fetch(
                "/api/workspace/id?name=Exercices&isFolder=true&canDelete=false"
              )
            ).json()
          ).id;
          // On crée le dossier d'exercice
          const respCreate = await fetch("/api/workspace/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: exerciceName,
              isFolder: true,
              parentId: parentId,
              content: null,
              isExercice: true,
            }),
          });
          const dataCreate = await respCreate.json();
          const folderId = dataCreate?.item?.id;
          // On crée le fichier qui contient le code par défaut
      await fetch("/api/workspace/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: exerciceName + ".py",
              isFolder: false,
              parentId: folderId,
        content: defaultContent ? encodeBase64(defaultContent) : null,
              isExercice: true,
            }),
          });
          // On charge le workspace à partir du dossier créé
          const respWorkspace = await fetch(
            `/api/workspace?id=${encodeURIComponent(folderId)}`
          );
          const dataWorkspace = await respWorkspace.json();
          if (!dataWorkspace.error) {
            setWorkspace(dataWorkspace.workspace);
          }
        } else {
          setOutput("Impossible de charger le workspace..." + dataId.error);
        }
      } else {
        const resp = await fetch("/api/workspace");
        const data = await resp.json();
        if (!data.error) {
          setWorkspace(data.workspace);
        } else {
          setOutput("Impossible de charger le workspace..." + data.error);
        }
      }
    }
    fetchWorkspace();
  }, [exerciceName, defaultContent, encodeBase64]);

  // Keep Explorer height in sync with the Editor height
  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setEditorHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onSelect = (id: string) => {
    if (!workspace) return;
    const find = (
      node: ITreeObjDir | ITreeObjFile,
      currentPath: string
    ): { node: ITreeObjDir | ITreeObjFile; path: string } | null => {
      const pathHere =
        node.type === "directory"
          ? `${currentPath}${node.name}/`
          : `${currentPath}${node.name}`;
      if (node.id === id) return { node, path: pathHere };
      if (node.type === "directory") {
        for (const child of node.children) {
          const res = find(child, pathHere);
          if (res) return res;
        }
      }
      return null;
    };
    const res = find(workspace, "./");
    if (!res) {
      setSelectedFile(null);
      setSelectedFilePath(null);
      setSelectedDirId(null);
      
      return;
    }
    if (res.node.type === "file") {
      setSelectedFile(res.node as ITreeObjFile);
      setSelectedFilePath(res.path);
      setSelectedDirId(null);
      
    } else {
      setSelectedFile(null);
      setSelectedFilePath(null);
      setSelectedDirId(res.node.id);
      
    }
  };

  const onExplorerChange = (tree: ITreeObjDir) => {
    console.log("FileExplorer changed:", tree);
    setWorkspace(tree);
  };

  const triggerUpload = () => {
    uploadInputRef.current?.click();
  };

  const handleDownload = async () => {
    if (!workspace) return;
    // Determine target id: file => its id, else if a directory selected later we use that; currently only file selection tracked.
    // For now if file selected download file; if not, download root workspace zip.
    const targetId = selectedFile
      ? selectedFile.id
      : selectedDirId || workspace.id; // workspace is root dir fallback
    try {
      const resp = await fetch(
        `/api/workspace/download?id=${encodeURIComponent(targetId)}`
      );
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setOutput((o) => o + `\nErreur download: ${data.error || resp.status}`);
        return;
      }
      const blob = await resp.blob();
      // Derive filename from content-disposition if provided
      let filename = "download";
      const cd = resp.headers.get("Content-Disposition");
      const match = cd && /filename="?([^";]+)"?/i.exec(cd);
      if (match) filename = match[1];
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(urlObj);
        a.remove();
      }, 2000);
    } catch (e) {
      setOutput((o) => o + `\nErreur réseau download: ${(e as Error).message}`);
    }
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !workspace) return;
    const filesArr = Array.from(fileList);
    if (filesArr.length === 0) return;

    // Whitelist extensions & mime prefixes (Firefox respects accept filtering more strictly when valid)
    const allowedExtensions = [".py", ".txt", ".html", ".css", ".js"];
    const allowedMimePrefixes = ["image/", "audio/"];

    const isAllowed = (file: File) => {
      const nameLower = file.name.toLowerCase();
      for (const ext of allowedExtensions)
        if (nameLower.endsWith(ext)) return true;
      if (file.type) {
        for (const pref of allowedMimePrefixes)
          if (file.type.startsWith(pref)) return true;
        // text/plain often for .txt when extension test already covered; keep anyway
        if (file.type === "text/plain") return true;
      }
      return false;
    };

    const filtered = filesArr.filter(isAllowed);
    const skippedClient = filesArr.length - filtered.length;
    if (skippedClient > 0) {
      setOutput(
        (o) =>
          o +
          `\n${skippedClient} fichier(s) ignoré(s) côté client (type non autorisé).`
      );
    }

    const toBase64 = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            const bytes = new Uint8Array(reader.result);
            let binary = "";
            for (let i = 0; i < bytes.length; i++)
              binary += String.fromCharCode(bytes[i]);
            resolve(btoa(binary));
          } else if (typeof reader.result === "string") {
            // Fallback; convert UTF-16 string to binary safely (may not be optimal for large files)
            resolve(btoa(unescape(encodeURIComponent(reader.result))));
          } else {
            reject(new Error("Format de fichier non supporté"));
          }
        };
        reader.onerror = () =>
          reject(reader.error || new Error("Erreur lecture fichier"));
        reader.readAsArrayBuffer(file);
      });

    setOutput((o) => o + `\nPréparation de ${filtered.length} fichier(s)...`);
    const payloadFiles: { path: string; content: string }[] = [];
    for (const file of filtered) {
      const rel: string =
        file.webkitRelativePath && file.webkitRelativePath !== ""
          ? file.webkitRelativePath
          : file.name;
      try {
        const b64 = await toBase64(file);
        payloadFiles.push({ path: rel, content: b64 });
      } catch (err) {
        console.error("Conversion échouée", rel, err);
      }
    }
    if (payloadFiles.length === 0) {
      setOutput((o) => o + "\nAucun fichier convertible.");
      return;
    }
    setOutput((o) => o + `\nUpload en cours (${payloadFiles.length})...`);
    try {
      const resp = await fetch("/api/workspace/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: workspace.id, files: payloadFiles }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setOutput((o) => o + `\nErreur upload: ${data.error || "inconnue"}`);
      } else {
        setOutput(
          (o) =>
            o +
            `\nUpload terminé: ${data.created.length} créé(s), ${data.skipped.length} ignoré(s), ${data.invalid.length} invalide(s).`
        );
        // Rafraîchir workspace pour refléter nouveaux fichiers
        const wsResp = await fetch("/api/workspace");
        const wsData = await wsResp.json();
        if (!wsData.error) setWorkspace(wsData.workspace);
      }
    } catch (err) {
      setOutput((o) => o + `\nErreur réseau upload: ${(err as Error).message}`);
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const onCodeChange = (newCode: string) => {
    if (selectedFile && workspace) {
      const updatedFile: ITreeObjFile = {
        ...selectedFile,
        content: encodeBase64(newCode),
      };
      const updateFileInTree = (
        node: ITreeObjDir | ITreeObjFile
      ): ITreeObjDir | ITreeObjFile => {
        if (node.id === selectedFile.id && node.type === "file") {
          return updatedFile;
        } else if (node.type === "directory") {
          return {
            ...node,
            children: node.children.map(updateFileInTree),
          };
        }
        return node;
      };
      const updatedWorkspace = updateFileInTree(workspace);
      setSelectedFile(updatedFile);
      setWorkspace(updatedWorkspace as ITreeObjDir);

      // Debounce sauvegarde (1s après dernière frappe)
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = window.setTimeout(() => {
        fetch("/api/workspace/update-content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: updatedFile.id,
            content: updatedFile.content,
          }),
        })
          .then((res) => res.json())
          .then((data) =>
            console.log("File content updated successfully on server:", data)
          )
          .catch((error) =>
            console.error("Error updating file content:", error)
          );
      }, 1000);
    }
  };

  const handleRun = async () => {
    if (!workspace || !selectedFile || !selectedFilePath) return;

    // Bump counters: runId (logic) and runCounter (UI reset trigger)
    const myRunId = ++runIdRef.current;
    setRunCounter((c) => c + 1);

    // If a previous run is blocked waiting for input, cancel it first
    if (awaitingInput && inputResolverRef.current?.reject) {
      try {
        inputResolverRef.current.reject(CANCELLED.current);
      } catch {}
      inputResolverRef.current = null;
      setAwaitingInput(false);
      setInputPrompt("");
    }

    const files: Record<string, string> = {};
    const collectFiles = (
      node: ITreeObjDir | ITreeObjFile,
      parentPath: string
    ) => {
      const path =
        node.type === "file"
          ? `${parentPath}${node.name}`
          : `${parentPath}${node.name}/`;
      if (node.type === "file") {
        files[path] = decodeBase64(node.content ?? "");
      } else if (node.type === "directory") {
        for (const child of node.children) {
          collectFiles(child, path);
        }
      }
    };
    collectFiles(workspace, "./");
    const mainFilePath = selectedFilePath!; // garanti par condition initiale

    try {
      const lowerContent = files[mainFilePath]?.toLowerCase() || "";
      const isGame = lowerContent.includes("pygame");
      const isTurtle = lowerContent.includes("turtle");
      const isHtml = mainFilePath.endsWith(".html");
      setNeedsCanvas(isTurtle);
      if (isHtml) {
        // Pas de console pour exécution HTML réussie
        setAwaitingInput(false);
        setInputPrompt("");
        setIframeUrl(null);
        setOutput(""); // efface éventuel ancien output
        const resp = await fetch("/api/run-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainFilePath, files }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.url) {
          setOutput(data.error || "Erreur HTML"); // on affiche seulement en cas d'erreur
        } else {
          setIframeUrl(data.url);
        }
        return;
      }
      if (!isGame) {
        setIframeUrl(null);
        setOutput("");
        setAwaitingInput(false);
        setInputPrompt("");
        const io: SkulptIO = {
          onOutput: (t) => {
            if (myRunId !== runIdRef.current) return; // ignore stale output
            setOutput((prev) => prev + t);
          },
          requestInput: (prompt) => {
            if (myRunId !== runIdRef.current) {
              return Promise.reject(CANCELLED.current);
            }
            setAwaitingInput(true);
            setInputPrompt(prompt ?? "> ");
            return new Promise<string>((resolve, reject) => {
              inputResolverRef.current = { resolve, reject };
            }).then((v) => {
              if (myRunId !== runIdRef.current) return v; // no side effects if stale
              // Echo input to console like a real terminal
              setOutput((prev) => prev + (prompt || "") + v + "\n");
              setAwaitingInput(false);
              setInputPrompt("");
              inputResolverRef.current = null;
              return v;
            });
          },
        };
        const result = await runSkulpt(mainFilePath, files, io);
        if (myRunId !== runIdRef.current) return; // stale completion
        setAwaitingInput(false);
        setInputPrompt("");
        if (result && !result.endsWith("\n"))
          setOutput((prev) => prev + (result || ""));
      } else {
        setOutput("Compilation du jeu...");
        setIframeUrl(null);
        const resp = await fetch("/api/run-pygame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainFilePath, files }),
        });
        const data = await resp.json();
        console.log("Pygame run response:", data);
        if (data.url) {
          setOutput("Jeu lancé :");
          setIframeUrl(data.url);
        } else {
          setOutput(data.error || "Erreur inconnue");
        }
      }
    } catch (err: unknown) {
      if (myRunId !== runIdRef.current) return; // ignore errors from stale/cancelled runs
      if (err !== CANCELLED.current) {
        const msgRaw =
          typeof err === "string"
            ? err
            : (err as Error)?.message || String(err);
        setOutput(`Error: ${msgRaw}`);
      }
      setAwaitingInput(false);
      setInputPrompt("");
      inputResolverRef.current = null;
    }
  };

  const toggleExplorer = () => setIsExplorerCollapsed((v) => !v);

  return (
    <main className="w-full p-4 space-y-4">
      {!workspace && (
        <Panel title="Chargement">
          <div className="text-center text-zinc-600 py-8">
            Chargement du workspace...
          </div>
        </Panel>
      )}
      {workspace && (
        <>
          <Panel
            title={`Espace de travail`}
            actions={
              <>
                <button
                  type="button"
                  onClick={toggleExplorer}
                  className="text-xs px-2 py-1 rounded border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                >
                  {isExplorerCollapsed
                    ? "Afficher l'explorateur"
                    : "Masquer l'explorateur"}
                </button>
                <button
                  type="button"
                  onClick={triggerUpload}
                  className="text-xs px-2 py-1 rounded border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="text-xs px-2 py-1 rounded border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                >
                  Download
                </button>
                <button
                  onClick={handleRun}
                  disabled={
                    !selectedFile ||
                    !(
                      selectedFile.name.endsWith(".py") ||
                      selectedFile.name.endsWith(".html")
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <span aria-hidden>▶</span> Exécuter
                </button>
              </>
            }
          >
            <div className="flex w-full items-start">
              {/* Hidden input pour multi-upload & dossiers */}
              <input
                ref={uploadInputRef}
                type="file"
                // Accept list for common educational assets (images, audio, code & text)
                // Correct syntax: no leading slash before mime groups (fixes Firefox selection)
                accept="image/*,audio/*,.py,.txt,.html,.css,.js"
                multiple
                onChange={handleUploadFiles}
                className="hidden"
              />
              <div
                className="relative border-r border-zinc-200 overflow-auto"
                style={{
                  width: isExplorerCollapsed ? 0 : 200,
                  minWidth: isExplorerCollapsed ? 0 : 200,
                  height: editorHeight ? Math.min(editorHeight, 600) : 300,
                  maxHeight: 600,
                }}
              >
                {!isExplorerCollapsed && (
                  <FileExplorer
                    data={workspace}
                    onSelect={onSelect}
                    onChange={onExplorerChange}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="min-w-0" ref={editorContainerRef}>
                  <CodeEditor
                    filename={selectedFile?.name}
                    code={
                      selectedFile?.content
                        ? decodeBase64(selectedFile.content)
                        : ""
                    }
                    onChange={onCodeChange}
                  />
                </div>
              </div>
            </div>
          </Panel>
          {(output.trim().length > 0 || awaitingInput) && (
            <Panel title="Console">
              <div className="rounded-md border border-zinc-200">
                <Console
                  output={output}
                  awaitingInput={awaitingInput}
                  inputPrompt={inputPrompt}
                  resetCounter={runCounter}
                  onSubmitInput={(v) => inputResolverRef.current?.resolve(v)}
                />
              </div>
            </Panel>
          )}
          {needsCanvas && (
            <Panel title="Canvas Turtle">
              <div
                id="turtle-canvas"
                className="border border-zinc-200 rounded-md w-full h-96"
              />
            </Panel>
          )}
          {iframeUrl && (
            <Panel title={"Résultat"}>
              <div className="rounded-md border border-zinc-200 overflow-hidden">
                <PygbagFrame src={iframeUrl} />
              </div>
            </Panel>
          )}
        </>
      )}
    </main>
  );
}
