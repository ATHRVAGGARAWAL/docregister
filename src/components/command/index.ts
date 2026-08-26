/**
 * One import path for the command palette, so a host mounting it does not need
 * to know which file each piece happens to live in.
 */

export { CommandPalette, type CommandPaletteProps } from "./command-palette";
export { useCommandPalette, type CommandPaletteController } from "./use-command-palette";
export {
  COMMAND_WORKSPACES,
  type CommandSources,
  type CommandWorkspace,
  type CommandWorkspaceId,
} from "./command-sources";
export {
  COMMAND_GROUP_LABELS,
  type CommandGroupId,
  type CommandItem,
  type RankedCommandGroup,
  type RankedCommandItem,
} from "./command-items";
