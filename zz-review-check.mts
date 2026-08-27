import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DURATION, EASING, STAGGER, FULL_MOTION, NO_MOTION, motionSystem, staggerDelay, toMs } from "@/lib/motion";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Reveal, RevealItem, RevealList } from "@/components/motion/reveal";
import { Collapse } from "@/components/motion/collapse";

const out: string[] = [];
const ok = (label: string, cond: boolean, extra = "") =>
  out.push(`${cond ? "PASS" : "**FAIL**"} ${label} ${extra}`);

ok("staggerDelay(0)===0", staggerDelay(0) === 0);
ok("staggerDelay(-3)===0", staggerDelay(-3) === 0);
ok("staggerDelay(NaN)===0", staggerDelay(NaN) === 0);
ok("staggerDelay(3)===0.105", Math.abs(staggerDelay(3) - 0.105) < 1e-9, String(staggerDelay(3)));
ok("staggerDelay(50)===staggerDelay(6)", staggerDelay(50) === staggerDelay(6));
ok("toMs(control)===160", toMs(DURATION.control) === 160);
ok("motionSystem(null)===FULL", motionSystem(null) === FULL_MOTION);
ok("motionSystem(undefined)===FULL", motionSystem(undefined) === FULL_MOTION);
ok("motionSystem(true)===NO", motionSystem(true) === NO_MOTION);
ok("FULL frozen", Object.isFrozen(FULL_MOTION));
ok("NO frozen", Object.isFrozen(NO_MOTION));
ok("FULL.variants deep-frozen?", Object.isFrozen(FULL_MOTION.variants), `-> ${Object.isFrozen(FULL_MOTION.variants)}`);
ok("DURATION obj frozen?", Object.isFrozen(DURATION), `-> ${Object.isFrozen(DURATION)}`);
ok("all NO durations 0", Object.values(NO_MOTION.duration).every((d) => d === 0));
ok("NO.layout false", NO_MOTION.layout === false);

const visible = FULL_MOTION.variants.rise.visible as (i?: number) => unknown;
out.push("rise.visible(2) = " + JSON.stringify(visible(2)));
out.push("rise.visible(undefined) = " + JSON.stringify(visible(undefined)));
// what happens if custom is an object (motion passes whatever `custom` is)
out.push("rise.visible({}) = " + JSON.stringify(visible({} as never)));
out.push("NO rise.hidden = " + JSON.stringify(NO_MOTION.variants.rise.hidden));
out.push("NO collapse.hidden = " + JSON.stringify(NO_MOTION.variants.collapse.hidden));
out.push("NO press = " + JSON.stringify(NO_MOTION.variants.press));
out.push("EASING = " + JSON.stringify(EASING) + " STAGGER=" + JSON.stringify(STAGGER));

// identity aliasing check: STILL shared across four variant sets
out.push("STILL shared rise===fade: " + String(NO_MOTION.variants.rise === NO_MOTION.variants.fade));

const R = React.createElement;
out.push("--- server render ---");
out.push("RevealList: " + renderToStaticMarkup(
  R(MotionProvider, null,
    R(RevealList, { className: "space-y-3", "aria-label": "Register" } as never,
      R(RevealItem, { key: "a", index: 0, className: "row" } as never, "Row A"),
      R(RevealItem, { key: "b", index: 1, className: "row" } as never, "Row B"),
    ))));
out.push("RevealList ordered=false: " + renderToStaticMarkup(
  R(RevealList, { ordered: false } as never, R(RevealItem, { key: "a" } as never, "X"))));
out.push("Reveal alone: " + renderToStaticMarkup(R(Reveal, null, "Hi")));
out.push("Reveal in MotionProvider: " + renderToStaticMarkup(R(MotionProvider, null, R(Reveal, null, "Hi"))));
out.push("Collapse closed: [" + renderToStaticMarkup(R(Collapse, { open: false } as never, "Notes")) + "]");
out.push("Collapse open: " + renderToStaticMarkup(R(Collapse, { open: true, id: "notes", className: "px-2" } as never, "Notes")));
out.push("RevealList animateInitial: " + renderToStaticMarkup(
  R(RevealList, { animateInitial: true } as never, R(RevealItem, { key: "a", index: 2 } as never, "X"))));
console.log(out.join("\n"));
