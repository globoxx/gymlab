import { createContext, useContext } from "react";
import { IExtraActions } from "@/types/fileExplorer";

// @ts-expect-error: Default value for context is intentionally left undefined
export const ExtraActionsContext = createContext<IExtraActions>();

export function useExtraActions(): IExtraActions {
  return useContext(ExtraActionsContext);
}
