import type { Page } from "playwright/test";

export interface LayoutProblems {
  /** Visible elements wider than the viewport, described well enough to find. */
  overflowing: string[];
  /** Visible controls with a side under the minimum comfortable touch size. */
  smallTargets: string[];
}

/**
 * iOS Human Interface Guidelines and WCAG 2.2 (2.5.8) converge here: a control
 * a finger has to hit is at least 44 CSS pixels on both sides. A doctor uses
 * this one-handed between patients, often standing.
 */
const MIN_TAP_TARGET = 44;

/** Anything the browser will route a tap to and act on. */
const CONTROLS = 'button, a[href], [role="button"], input, select, textarea';

/**
 * Measure the two mobile failures that a screenshot hides.
 *
 * Note what this does *not* look at: `document.scrollWidth`. The dashboard's
 * root carries `overflow-x-clip`, which is what keeps a stray wide child from
 * producing a sideways scrollbar — and also what makes the document's own
 * width report as clean while a table, a chart or a long unbroken word sits
 * with half of itself outside the screen and unreachable. Measuring elements
 * against the viewport is the only way to see that.
 */
export async function measureLayout(page: Page): Promise<LayoutProblems> {
  return page.evaluate(
    ({ minTapTarget, controls }) => {
      const describe = (element: Element) => {
        const box = element.getBoundingClientRect();
        const label =
          element.getAttribute("aria-label") ??
          element.textContent?.trim().slice(0, 40) ??
          "";
        return `<${element.tagName.toLowerCase()}> ${Math.round(box.width)}x${Math.round(box.height)} ${label}`.trim();
      };

      const visible = (element: Element) => {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };

      const overflowing = [...document.querySelectorAll("*")]
        .filter((element) => visible(element))
        // One pixel of slack: sub-pixel layout rounding is not an overflow bug.
        .filter((element) => element.getBoundingClientRect().width > window.innerWidth + 1)
        .map(describe);

      const smallTargets = [...document.querySelectorAll(controls)]
        .filter((element) => visible(element))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width < minTapTarget || box.height < minTapTarget;
        })
        .map(describe);

      return { overflowing, smallTargets };
    },
    { minTapTarget: MIN_TAP_TARGET, controls: CONTROLS },
  );
}
