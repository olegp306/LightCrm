"use client";

import { useEffect, useState } from "react";

type ColorTheme = "light" | "dark";

const storageKey = "lightcrm.colorTheme";

function preferredTheme(): ColorTheme {
  if (typeof window === "undefined") {
    return "light";
  }
  const saved = window.localStorage.getItem(storageKey);
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(storageKey, theme);
  window.dispatchEvent(new CustomEvent("lightcrm:theme-change", { detail: theme }));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ColorTheme>("light");

  useEffect(() => {
    const nextTheme = preferredTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const isDark = theme === "dark";

  return (
    <label className="themeToggle">
      <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
      <input
        type="checkbox"
        checked={isDark}
        aria-label="Toggle dark mode"
        onChange={(event) => {
          const nextTheme = event.target.checked ? "dark" : "light";
          setTheme(nextTheme);
          applyTheme(nextTheme);
        }}
      />
      <i aria-hidden="true" />
    </label>
  );
}
