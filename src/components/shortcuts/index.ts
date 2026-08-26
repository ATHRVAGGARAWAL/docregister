/**
 * One import path for the shortcut layer, so a workspace declaring a key does
 * not need to know which file the registry happens to live in.
 */

export { ShortcutProvider, type ShortcutProviderProps } from "./shortcut-provider";
export { ShortcutHelpSheet } from "./shortcut-help-sheet";
export { ShortcutHelpButton } from "./shortcut-help-button";
export { ShortcutKeyCap, ShortcutKeys } from "./shortcut-keys";

export {
  useApplePlatform,
  useEscapeLayer,
  useShortcut,
  useShortcutRegistry,
  useShortcuts,
  type RegisteredShortcut,
  type ShortcutDefinition,
  type ShortcutRegistry,
} from "@/hooks/use-keyboard-shortcuts";
