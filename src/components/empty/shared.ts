import type { Ref } from "react";

import type { EmptyStateAnnounce } from "@/components/ui/empty-state";

/**
 * The placement knobs every domain variant forwards to `EmptyState` untouched.
 *
 * Copy and affordances belong to the variant — that is the whole point of
 * having variants — while where the block sits, how loud it is and which
 * heading level it occupies belong to the screen around it.
 */
export type EmptyVariantProps = {
  className?: string;
  compact?: boolean;
  /** Pass `off` when the surrounding section is already a live region. */
  announce?: EmptyStateAnnounce;
  headingLevel?: 2 | 3 | 4;
  id?: string;
  ref?: Ref<HTMLDivElement>;
};

/**
 * Longest search term echoed back inside a title.
 *
 * The register search and the recall question box set no `maxLength`, so a
 * pasted paragraph arrives intact. A heading is a poor place to render one,
 * and everything the doctor needs next — the description, the button that
 * undoes the filter — sits underneath it.
 */
const MAX_ECHOED_TERM = 48;

/**
 * Quotes a search term for a title, clipped by code point rather than by UTF-16
 * unit so a Devanagari name is never cut mid-character.
 */
export function quoteTerm(value: string): string {
  const term = value.trim();
  const characters = Array.from(term);

  return characters.length > MAX_ECHOED_TERM
    ? `“${characters.slice(0, MAX_ECHOED_TERM - 1).join("")}…”`
    : `“${term}”`;
}
