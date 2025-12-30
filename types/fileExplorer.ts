import { IdObj } from "react-arborist/dist/types";

export interface ITreeObj extends IdObj {
  // id: string;
  name: string;
  parentId?: string | null;
  type: "directory" | "file";
  canRename: boolean;
  canDelete: boolean;
  canMove: boolean;
}

export interface ITreeObjFile extends ITreeObj {
  type: "file";
  content: string | null;
}

export interface ITreeObjDir extends ITreeObj {
  type: "directory";
  isOpen?: boolean;
  children: TreeObj[];
}

export type TreeObj = ITreeObjFile | ITreeObjDir;

export interface IExtraActions {
  delete: (id: string) => void;
  addFile: (parentId: string) => void;
  addFolder: (parentId: string) => void;
  select: (id: string) => void;
}
