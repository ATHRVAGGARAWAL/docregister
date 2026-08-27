"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, ComponentType } from "react";

import type { MixChart as MixChartImpl } from "@/components/charts/mix-chart";
import type { VolumeChart as VolumeChartImpl } from "@/components/charts/volume-chart";
import { ChartPending } from "@/components/lazy/pending";

/**
 * The two analytics charts, deferred off the first load.
 *
 * Recharts is the largest removable thing this app downloads. Under
 * `next experimental-analyze`, recharts and what it drags behind it — d3-scale,
 * d3-shape, d3-time-format, d3-color, d3-format, d3-array, d3-interpolate,
 * d3-time, d3-path, decimal.js-light, es-toolkit, @reduxjs/toolkit, immer,
 * redux, react-redux and reselect — comes to a 342 kB chunk. Only the Next and
 * React runtime is bigger, and that is not something an application can
 * decline. Nothing on the dictation path touches any of it: it rode the
 * critical path only because these two cards sit on the same screen as the
 * record key.
 *
 * Deferring them takes `/` from 1575 kB to 1236 kB of JavaScript before
 * hydration, 455 kB to 359 kB gzipped, 385 kB to 306 kB brotli — two
 * `next build` runs of the same tree differing only in where `overview-view`
 * imports these two names from. Those totals include the 110 kB `nomodule`
 * polyfill chunk, which no browser that can run this app downloads; counting
 * only what a phone actually fetches, 1465 kB to 1126 kB raw and 350 kB to
 * 271 kB brotli, a 23% cut.
 *
 * `ssr: false` rather than a server-rendered dynamic import, for two reasons
 * that point the same way. Recharts sizes itself from a measured DOM box, so
 * its server render is an empty frame either way — the SSR pass buys no pixels.
 * And `next/dynamic` emits a `PreloadChunks` element on the server whenever
 * `ssr` is left on, which puts the chunk back beside the document and undoes
 * the split. With `ssr: false` the server renders `loading` in its place, so
 * the HTML still carries a card of the right height.
 *
 * Deliberately not gated on scroll position. These load as soon as hydration is
 * done, while the page is fresh and the network is known good, rather than at
 * whatever moment the doctor scrolls — which on a clinic phone may be after the
 * signal has gone.
 */

const loadVolumeChart = () => import("@/components/charts/volume-chart");
const loadMixChart = () => import("@/components/charts/mix-chart");

export const VolumeChart: ComponentType<ComponentProps<typeof VolumeChartImpl>> = dynamic(
  () => loadVolumeChart().then((mod) => mod.VolumeChart),
  {
    ssr: false,
    // One series, so `ChartFrame` draws no legend; the chart trails its own
    // "N today" line. Both flags are here to make the placeholder the same
    // height as what replaces it.
    loading: () => <ChartPending title="patient volume" footer />,
  },
);

export const MixChart: ComponentType<ComponentProps<typeof MixChartImpl>> = dynamic(
  () => loadMixChart().then((mod) => mod.MixChart),
  {
    ssr: false,
    // Two series, so the legend row is drawn; no trailing summary line.
    loading: () => <ChartPending title="patient mix" legend />,
  },
);

/**
 * Start both chart chunks without rendering either.
 *
 * The overview is one tab among several and is rendered only while it is the
 * chosen one, so a doctor who deep-links to `?view=register` has not fetched
 * either chunk. This is for the moment the overview tab is aimed at rather than
 * the moment it is chosen — `onPointerDown` and `onFocus` both fire before the
 * click that changes the view. Repeat calls are free: the import is cached
 * after the first.
 */
export function preloadCharts(): void {
  // Rejections are swallowed because nothing is waiting on this. Rendering the
  // chart for real retries the same import, and that path has a placeholder and
  // an error boundary behind it.
  void loadVolumeChart().catch(() => {});
  void loadMixChart().catch(() => {});
}
