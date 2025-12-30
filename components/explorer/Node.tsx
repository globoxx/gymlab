import "./styles.css";
import { NodeRendererProps, NodeHandlers } from 'react-arborist';
import {
  FaFolderOpen,
  FaFolder,
  FaFolderPlus as FolderPlus,
  FaTrashAlt as Trash
} from "react-icons/fa";
import {
  FiFileText as FileText,
  FiEdit2 as Edit,
  FiFilePlus as FilePlus
} from "react-icons/fi";
import classNames from "classnames";
import { IExtraActions, ITreeObj } from "@/types/fileExplorer"
import { useExtraActions } from "./utils";

const size = 16;
const smallSize = 12;
const gray = "#2C2C2C";

interface IconProps {
  isFolder: boolean;
  toggle: React.MouseEventHandler<Element>;
  isSelected: boolean;
  isOpen: boolean;
}

function Icon({ isFolder, isSelected, toggle, isOpen }: IconProps) {
  if (isFolder) {
    const Folder = isOpen ? FaFolderOpen : FaFolder;
    return (
      <Folder
        onClick={toggle}
        className="icon folder"
        // fillOpacity="0.7"
        color="#81CFFA"
        size={size}
      />
    );
  } else {
    return (
      <FileText
        className="icon file"
        stroke={isSelected ? gray : "#333"}
        strokeOpacity={isSelected ? "0.8" : "0.4"}
        size={size}
      />
    );
  }
}

type FormProps = { defaultValue: string } & NodeHandlers;

function RenameForm({ defaultValue, submit, reset }: FormProps) {
  const inputProps = {
    defaultValue,
    autoFocus: true,
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      submit(e.currentTarget.value);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Enter":
          submit(e.currentTarget.value);
          break;
        case "Escape":
          reset();
          break;
      }
    }
  };
  return <input type="text" {...inputProps} />;
}

type TitleActionsProps<T extends ITreeObj> = Pick<
  NodeRendererProps<T>,
  "data" | "state" | "handlers"
> & {
  isFolder: boolean;
  extraActions: IExtraActions;
  canRename: boolean;
  canDelete: boolean;
  canMove: boolean;
};

function TitleActions<T extends ITreeObj>(props: TitleActionsProps<T>) {
  const { data, handlers, state, isFolder, extraActions, canRename, canDelete, canMove } = props;
  if (state.isEditing) {
    return <RenameForm defaultValue={data.name} {...handlers} />;
  }
  const folderActions = isFolder ? (
    <>
      <button onClick={() => extraActions.addFile(data.id)} title="Add File" disabled={!canMove}>
        <FilePlus size={smallSize} color={gray} />
      </button>
      <button
        onClick={() => extraActions.addFolder(data.id)}
        title="Add Directory"
        disabled={!canMove}
      >
        <FolderPlus size={smallSize} color={gray} />
      </button>
    </>
  ) : null;
  return (
    <span className="row-title">
      <span>{data.name}</span>
      <span className="actions">
        <button onClick={handlers.edit} title="Rename" disabled={!canRename}>
          <Edit size={smallSize} color={gray} />
        </button>
        {folderActions}
        <button onClick={() => extraActions.delete(data.id)} title="Delete" disabled={!canDelete}>
          <Trash size={smallSize} color={gray} />
        </button>
      </span>
    </span>
  );
}

export default function Node<T extends ITreeObj>(props: NodeRendererProps<T>) {
  const { innerRef, styles, data, handlers, state} = props;
  const isFolder = data.type === "directory";
  const isOpen = !!state.isOpen;
  const extraActions = useExtraActions();
  const onSelect = (e: React.MouseEvent<Element, MouseEvent>, args: { selectOnClick: boolean }) => {
    handlers.select(e, args);
    extraActions.select(data.id);
  };
  return (
    <div
      ref={innerRef}
      className={classNames("row", state)}
      // Use custom onSelect handler to call both select functions
      onClick={(e) => onSelect(e, { selectOnClick: true })}
    >
      {/**
       * react-arborist fournit l'indentation via paddingLeft. Cela réduit l'espace disponible
       * interne et, avec AutoSizer (largeur fixe), les icônes pouvaient rétrécir à 0px quand
       * paddingLeft devenait important. On transforme donc ce padding en margin pour préserver
       * la largeur utile du contenu et empêcher le squash des icônes.
       */}
      {(() => {
        const indentPadding = styles.indent?.paddingLeft || 0;
        return (
          <div
            className="row-contents"
            style={{ marginLeft: indentPadding, paddingLeft: 0 }}
          >
            <Icon
              toggle={handlers.toggle}
              isFolder={isFolder}
              isOpen={isOpen}
              isSelected={state.isSelected}
            />
            <TitleActions
              isFolder={isFolder}
              data={data}
              handlers={handlers}
              state={state}
              extraActions={extraActions}
              canRename={data.canRename}
              canDelete={data.canDelete}
              canMove={data.canMove}
            />
          </div>
        );
      })()}
    </div>
  );
}
