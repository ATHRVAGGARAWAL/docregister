import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The shadcn/21st.dev class merger.
 *
 * `clsx` resolves the conditionals, `twMerge` resolves the conflicts — so a
 * caller's `px-6` beats a component's built-in `px-4` instead of the two
 * fighting over specificity. Every component in `components/ui` routes its
 * `className` through this, which is what makes a component pasted from
 * 21st.dev overridable at the call site.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
