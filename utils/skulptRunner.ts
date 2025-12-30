declare global {
  interface Window {
    Sk: any;
  }
}

export interface SkulptIO {
  // Called whenever Skulpt prints output
  onOutput?: (text: string) => void;
  // Called when Python's input() is invoked; should resolve with the user input string
  requestInput?: (prompt: string) => Promise<string>;
}

export async function runSkulpt(
  mainFile: string,
  files: Record<string, string>,
  io?: SkulptIO
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";

    if (!window.Sk.builtinFiles) {
      window.Sk.builtinFiles = { files: {} };
    }

    // Register workspace files into Skulpt's virtual FS
    for (const [filename, content] of Object.entries(files)) {
      if (filename.endsWith('.py')) {
        const skulptPath = filename.startsWith('./') ? filename : `./${filename}`;
        window.Sk.builtinFiles.files[skulptPath] = content;
      }
    }

    const builtinRead = (file: string) => {
      const normalized = file.startsWith('./') ? file : `./${file}`;

      // 1. Check in workspace-provided files first
      if (window.Sk.builtinFiles.files[normalized]) {
        return window.Sk.builtinFiles.files[normalized];
      }

      // 2. Fallback to Skulpt stdlib
      if (window.Sk.builtinFiles.files[file]) {
        return window.Sk.builtinFiles.files[file];
      }

      throw `File not found: '${file}'`;
    };

    // Clear turtle canvas before each run
    const canvasDiv = document.getElementById("turtle-canvas");
    if (canvasDiv) canvasDiv.innerHTML = "";

    // Configure Skulpt
    window.Sk.pre = "skulpt-output"; // id where print() would go, but we capture output ourselves too
    window.Sk.configure({
      output: (text: string) => {
        output += text;
        if (io?.onOutput) io.onOutput(text);
      },
      read: builtinRead,
      python3: true,
      inputfunTakesPrompt: true,
      inputfun: (prompt: string) => {
        if (io?.requestInput) {
          // Delegate to UI, which returns a Promise<string>
          return io.requestInput(prompt);
        }
        // Fallback to browser prompt to maintain functionality if no UI is provided
        const val = window.prompt(prompt ?? "Input:") ?? "";
        return Promise.resolve(val);
      },
    });

    // Set Turtle target div
    (window.Sk.TurtleGraphics || (window.Sk.TurtleGraphics = {})).target =
      "turtle-canvas";

    window.Sk.misceval
      .asyncToPromise(() => {
        const mainCode = files[mainFile];
        return window.Sk.importMainWithBody("<stdin>", false, mainCode, true);
      })
      .then(() => resolve(output))
      .catch((err: unknown) => {
        const message = typeof err === 'string' ? err : (err as { toString?: () => string })?.toString?.() ?? 'Unknown error';
        reject(message);
      });
  });
}
