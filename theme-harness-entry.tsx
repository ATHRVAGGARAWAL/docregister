// THROWAWAY. Mounts the shipped preview + switcher in a bare page so the
// components can be measured in a real browser without adding a route.
import { createRoot } from "react-dom/client";

import { ThemeColorMeta, ThemePreview, ThemeSwitcher } from "@/components/theme";

createRoot(document.getElementById("root")!).render(
  <div className="bg-background text-foreground min-h-full p-6">
    <ThemeColorMeta />
    <div className="mb-6 flex items-center gap-4">
      <ThemeSwitcher data-harness="full" />
      <ThemeSwitcher compact data-harness="compact" />
    </div>
    <ThemePreview />
  </div>,
);
