import { useCallback, useEffect, useMemo, useState } from "react";
import TreeModel from "tree-model-improved";
import { ITreeObjDir, TreeObj, ITreeObjFile, IExtraActions } from "@/types/fileExplorer";

interface IBackend {
  data: ITreeObjDir;
  onMove: (
    srcIds: string[],
    dstParentId: string | null,
    dstIndex: number
  ) => void;
  onToggle: (id: string, isOpen: boolean) => void;
  onEdit: (id: string, name: string) => void;
  extraActions: IExtraActions;
}

function findById(
  node: TreeModel.Node<TreeObj>,
  id: string
): TreeModel.Node<TreeObj> | undefined {
  return node.first((n) => n.model.id === id);
}

function getNodeId(node: TreeModel.Node<TreeObj>) {
  return node.model.id;
}

function getNodePathStr(node: TreeModel.Node<TreeObj>) {
  return node.getPath().map(getNodeId).join("/");
}

/**
 * function that sorts the tree recursively first by the folder name then by file name
 * @param node
 */
function sortNodeTree(node: TreeObj): TreeObj {
  if (node.type === "file") {
    return node;
  }
  // directory
  const children = node.children
    .slice()
    .sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    )
    .map(sortNodeTree);
  return {
    ...node,
    children,
  };
}

const confirmAsync = (q: string) =>
  new Promise<void>((resolve, reject) => {
    const result = window.confirm(q);
    if (result) {
      return resolve();
    }
    return reject(new Error("Not confirmed"));
  });

function useTreeBackend<T extends ITreeObjDir = ITreeObjDir>(
  initialData: T,
  onSelect: (id: string) => void,
  onChange?: (v: T) => void
): IBackend {
  const [data, setData] = useState<T>(initialData!);
  useEffect(() => {
    setData(initialData!);
  }, [initialData]);

  const root = useMemo(() => new TreeModel().parse(data), [data]);
  const find = useCallback((id: string) => findById(root, id), [root]);
  const update = () => {
    const newTree = { ...(sortNodeTree(root.model) as T) };
    setData(newTree);
    onChange?.(newTree);
  };

  const onMove = (
    srcIds: string[],
    dstParentId: string | null,
    dstIndex: number
  ) => {
    try {
      const dstParent = dstParentId ? find(dstParentId) : root;
      if (!dstParent) return;
      const dstParentPathId = getNodePathStr(dstParent);
      for (const srcId of srcIds) {
        const src = find(srcId);
        if (!src) continue;
        const srcNodePathId = getNodePathStr(src);
        // Prevent folder to be set on a child folder of its.
        // Destination can not be child of the source.
        if (dstParentPathId.startsWith(srcNodePathId)) continue;
        const newItem = new TreeModel().parse(src.model);
        dstParent.addChildAtIndex(newItem, dstIndex);
        src.drop();
      }
      update();
    } catch (error) {
      console.error("Error moving nodes:", error);
      console.error("No change in backend");
      return;
    }

    // Call backend to move the items one by one
    srcIds.forEach((itemId) => {
      const resp = fetch(`/api/workspace/move`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
          newParentId: dstParentId,
        }),
      });
      resp
        .then((res) => res.json())
        .then((data) => {
          console.log("Item moved successfully:", data);
        })
        .catch((error) => {
          console.error("Error moving item:", error);
        });
    });
  };

  const onToggle = (id: string, isOpen: boolean) => {
    const node = find(id);
    if (node) {
      node.model.isOpen = isOpen;
      update();
    }
  };

  const onEdit = (id: string, newName: string) => {
    try {
      const node = find(id);
      if (node) {
        node.model.name = newName;
        update();
      }
    } catch (error) {
      console.error("Error editing node:", error);
      console.error("No change in backend");
      return;
    }

    // Call backend to update the name
    const resp = fetch(`/api/workspace/rename`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, newName }),
    });
    resp
      .then((res) => res.json())
      .then((data) => {
        console.log("File renamed successfully:", data);
      })
      .catch((error) => {
        console.error("Error renaming file:", error);
      });
  };

  const onDelete = (id: string) => {
    try {
      const node = find(id);
      if (node) {
        // Interdire suppression du root (parentId null / undefined)
        if (node.model.parentId == null) {
          window.alert("Suppression du dossier racine interdite");
          return;
        }
        // confirmAsync(`Are you sure you want to delete ${node.model.name}?`)
        //   .then(() => {
        //     node.drop();
        //     update();
        //   })
        //   .catch(console.info);
        const confirmed = window.confirm(
          `Are you sure you want to delete ${node.model.name}?`
        );
        if (confirmed) {
          node.drop();
          update();
        }
      }
    } catch (error) {
      console.error("Error deleting node:", error);
      console.error("No change in backend");
      return;
    }

    // Call backend to delete the item
    const resp = fetch(`/api/workspace/delete`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
    resp
      .then((res) => res.json())
      .then((data) => {
        console.log("Item deleted successfully:", data);
      })
      .catch((error) => {
        console.error("Error deleting item:", error);
      });
  };

  const onAddFile = async (parentId: string) => {
    const parentNode = find(parentId);
    if (!parentNode) return;
    const filename = window.prompt(`Nom du nouveau fichier :`);
    if (!filename) return;
    try {
      const res = await fetch(`/api/workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: filename, isFolder: false, parentId, content: null }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        window.alert(data.error || "Erreur lors de la création");
        return;
      }
      const newFile = { id: data.item.id, name: data.item.name, type: "file", content: null } as ITreeObjFile;
      const newItem = new TreeModel().parse(newFile);
      parentNode.addChild(newItem);
      update();
      console.log("File created and synced:", data.item);
    } catch (e) {
      console.error("Erreur création fichier:", e);
    }
  };

  const onAddFolder = async (parentId: string) => {
    const parentNode = find(parentId);
    if (!parentNode) return;
    const foldername = window.prompt(`Nom du nouveau dossier :`);
    if (!foldername) return;
    try {
      const res = await fetch(`/api/workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: foldername, isFolder: true, parentId, content: null }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        window.alert(data.error || "Erreur lors de la création");
        return;
      }
      const newFolder = { id: data.item.id, name: data.item.name, type: "directory", children: [] } as ITreeObjDir;
      const newItem = new TreeModel().parse(newFolder);
      parentNode.addChildAtIndex(newItem, 0);
      update();
      console.log("Folder created and synced:", data.item);
    } catch (e) {
      console.error("Erreur création dossier:", e);
    }
  };

  const extraActions = {
    delete: onDelete,
    addFile: onAddFile,
    addFolder: onAddFolder,
    select: onSelect,
  };

  return {
    data: root.model,
    onMove,
    onToggle,
    onEdit,
    extraActions,
  };
}

export default useTreeBackend;
