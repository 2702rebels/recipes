"use client";

import { useEffect } from "react";

/**
 * Prints in light mode whatever theme is active. Removes the `dark` class from <html> just before printing (Ctrl+P
 * or `window.print()`) and puts it back afterwards. `app/global.css` also resets the colors in `@media print` as a
 * fallback.
 */
export const PrintLightMode = () => {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains("dark");
      if (wasDark) root.classList.remove("dark");
      root.style.colorScheme = "light";
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = "";
      wasDark = false;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
};
