/**
 * The palette's item model and its ranking, kept apart from the rendering.
 *
 * A command is data — a label, the words a doctor might reach for instead of
 * that label, and the thing to do. The component below decides how one looks;
 * this decides which ones are worth showing and in what order.
 */

import type { ComponentType } from "react";

import { fuzzyScore, type MatchRange } from "@/components/command/fuzzy";
import type { IconProps } from "@/components/icons";

export type CommandGroupId = "recent" | "patients" | "visits" | "navigate" | "actions";

export const COMMAND_GROUP_LABELS: Record<CommandGroupId, string> = {
  recent: "Recent",
  patients: "Patients",
  visits: "Recent visits",
  navigate: "Go to",
  actions: "Actions",
};

/**
 * The resting order, and the tie-break when two groups score alike.
 *
 * Patients sit last here and almost always appear first in practice: with
 * nothing typed there are no patient results at all, and once a name is typed
 * the group ordering below is decided by score, not by this list.
 */
const GROUP_ORDER: CommandGroupId[] = ["recent", "visits", "navigate", "actions", "patients"];

export interface CommandItem {
  /** Unique across the whole palette — it becomes the option's DOM id. */
  id: string;
  group: CommandGroupId;
  label: string;
  /** Second line. Shown, and searched. */
  detail?: string;
  /** Trailing text: a date, a count, "Current". Shown, and read out with the row. */
  meta?: string;
  /** Searched, never shown. */
  keywords?: string;
  icon: ComponentType<IconProps>;
  /**
   * Survives a failed local match.
   *
   * Patient rows come back from a server search that also matches on phone
   * number and on trigram similarity, so a row whose name does not contain the
   * typed characters is a correct answer to the query — not a near miss for
   * this file to throw away.
   */
  keepUnmatched?: boolean;
  run: () => void;
}

export interface RankedCommandItem {
  item: CommandItem;
  score: number;
  /** Over `item.label` only; a keyword-only hit highlights nothing. */
  ranges: MatchRange[];
}

export interface RankedCommandGroup {
  id: CommandGroupId;
  label: string;
  items: RankedCommandItem[];
}

/**
 * What a keyword hit gives up against a hit on the visible label.
 *
 * Typing "money" should find Accounts, but never above a row whose own name is
 * what was typed — the doctor can see why the second one is there.
 */
const KEYWORD_PENALTY = 20;

/**
 * Score, filter, group and order.
 *
 * Groups are ordered by their best item rather than by a fixed list, so typing
 * a name puts patients on top and typing "reg" puts the workspace there,
 * without either being special-cased. Sorting is stable, so items that score
 * alike stay in the order the caller built them — which for patients and visits
 * is the order the server sent, newest first.
 */
export function rankCommandItems(
  items: CommandItem[],
  query: string,
  limits: Partial<Record<CommandGroupId, number>> = {},
): RankedCommandGroup[] {
  const trimmed = query.trim();
  const byGroup = new Map<CommandGroupId, RankedCommandItem[]>();

  for (const item of items) {
    let score = 0;
    let ranges: MatchRange[] = [];

    if (trimmed !== "") {
      const label = fuzzyScore(item.label, trimmed);
      const searchable = [item.detail, item.keywords].filter(Boolean).join(" ");
      const secondary = searchable === "" ? null : fuzzyScore(searchable, trimmed);

      if (label === null && secondary === null && !item.keepUnmatched) continue;

      const secondaryScore = secondary === null ? -Infinity : secondary.score - KEYWORD_PENALTY;
      score = Math.max(label?.score ?? -Infinity, secondaryScore, 0);
      ranges = label?.ranges ?? [];
    }

    const bucket = byGroup.get(item.group);
    if (bucket) bucket.push({ item, score, ranges });
    else byGroup.set(item.group, [{ item, score, ranges }]);
  }

  const groups: RankedCommandGroup[] = [];

  for (const [id, bucket] of byGroup) {
    const ranked = trimmed === "" ? bucket : [...bucket].sort((a, b) => b.score - a.score);
    const limit = limits[id];
    groups.push({
      id,
      label: COMMAND_GROUP_LABELS[id],
      items: limit === undefined ? ranked : ranked.slice(0, limit),
    });
  }

  return groups
    .filter((group) => group.items.length > 0)
    .sort((a, b) => {
      if (trimmed !== "") {
        const byScore = (b.items[0]?.score ?? 0) - (a.items[0]?.score ?? 0);
        if (byScore !== 0) return byScore;
      }
      return GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id);
    });
}

/** Every ranked item in the order it is rendered — what the arrow keys walk. */
export function flattenGroups(groups: RankedCommandGroup[]): RankedCommandItem[] {
  return groups.flatMap((group) => group.items);
}
