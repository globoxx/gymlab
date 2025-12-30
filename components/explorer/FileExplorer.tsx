import { Tree, NodeRenderer } from "react-arborist";
import Node from "./Node";
import useTree from "./useTree";
import AutoSizer from "react-virtualized-auto-sizer";
import { ExtraActionsContext } from "./utils";

import "./styles.css";
import { ITreeObj, ITreeObjDir } from "@/types/fileExplorer";

type IGTreeProps<T extends ITreeObj = ITreeObjDir> = Parameters<
  typeof Tree
>[0] & {
  data: T;
  onSelect: (id: string) => void;
  onChange?: (tree: T) => void;
  children: NodeRenderer<T>; // Pick<Parameters<typeof Tree>[0], 'children'>
};

function GTree(props: IGTreeProps) {
  const {
    width,
    height,
    data: serverData,
    onSelect,
    onChange,
    indent = 15,
    children: ChildrenComponent = Node,
  } = props;

  const { data, onMove, onToggle, onEdit, extraActions } = useTree(
    serverData!,
    onSelect,
    onChange
  );

  return (
    <ExtraActionsContext.Provider value={extraActions}>
      <Tree<ITreeObj>
        className="react-aborist"
        data={data}
        onMove={onMove}
        onToggle={onToggle}
        onEdit={onEdit}
        height={height}
        width={width}
        indent={indent}
        // hideRoot
      >
        {ChildrenComponent as any}
      </Tree>
    </ExtraActionsContext.Provider>
  );
}

export default function FileExplorer({ data, onSelect, onChange }: { data: ITreeObjDir | null, onSelect: (id: string) => void, onChange: (tree: ITreeObjDir) => void }) {
  
    return (
    <div style={{ height: "100%", width: "100%" }}>
      <AutoSizer>
        {({ width, height }) => (
          <GTree data={data!} onSelect={onSelect} onChange={onChange} width={width} height={height}>
            {Node as any}
          </GTree>
        )}
      </AutoSizer>
    </div>
  );
}
