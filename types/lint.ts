// Shared diagnostic type between the editor UI and the lint web worker
export type Diagnostic = {
  from: number;
  to: number;
  message: string;
  severity: 'error' | 'warning';
};
