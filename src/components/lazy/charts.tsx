"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, ComponentType } from "react";

import type { MixChart as MixChartImpl } from "@/components/charts/mix-chart";
import type { VolumeChart as VolumeChartImpl } from "@/components/charts/volume-chart";
import { ChartPending } from "@/components/lazy/pending";

/**
 * The two analytics charts, deferred off the first load.
 *
 * Recharts is the largest removable thing this app downloads. It and the
 * dependency tree it declares — victory-vendor's d3 bundle, @reduxjs/toolkit,
 * react-redux, immer, reselect, decimal.js-light, es-toolkit — build into one
 * 341.8 kB chunk, 98.0 kB gzipped, 82.2 kB brotli. Only the Next and React
 * runtime is bigger, and that is not something an application can decline.
 * Nothing on the dictation path touches any of it: it rode the critical path
 * only because these two cards sit on the same screen as the record key.
 *
 * Measured, not estimated. Two `next build` runs of the same tree, differing
 * only in where `overview-view` imports these two names from, with First Load
 * JS reconstructed from the route's build and client-reference manifests
 * (Next 16 stopped printing it — see the note in
 * `next/dist/docs/01-app/02-guides/upgrading/version-16.md`) and compressed at
 * gzip -9 and brotli -11:
 *
 *   /                 1574.9 kB -> 1235.7 kB raw
 *                      455.2 kB ->  358.5 kB gzip
 *                      384.7 kB ->  305.7 kB brotli   (9 chunks -> 10)
 *
 * Those totals include a 110.0 kB polyfill chunk that Next emits `nomodule`, so
 * no browser that can run this app fetches it. Counting only what a phone
 * actually downloads: 1464.9 kB -> 1125.7 kB raw and 350.4 kB -> 271.4 kB
 * brotli, a 22% cut. `/login` and `/_not-found` came out byte-identical.
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
    // summary line. Both flags exist to make the placeholder the same height as
    // what replaces it.
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
 * The overview is one tab among several and is mounted only while it is the
 * chosen one, so a doctor who deep-links to `?view=register` has fetched
 * neither chunk. This is for the moment the overview tab is aimed at rather
 * than the moment it is chosen — `onPointerDown` and `onFocus` both fire before
 * the click that changes the view. Repeat calls are free: the import is cached
 * after the first.
 */
export function preloadCharts(): void {
  // Rejections are swallowed because nothing is waiting on this. Rendering a
  // chart for real retries the same import, and that path has a placeholder and
  // the dashboard's error boundary behind it.
  void loadVolumeChart().catch(() => {});
  void loadMixChart().catch(() => {});
}
