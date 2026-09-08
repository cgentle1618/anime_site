// Frontend: light / dark theme state.
//
// The choice lives in localStorage ("light" | "dark" | "system"); "system"
// follows prefers-color-scheme live. The only DOM side effect is stamping
// <html data-theme="...">, which index.css keys every semantic colour off.
// index.html stamps the same attribute before first paint, so there is no
// flash of the wrong theme on load.
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const THEME_STORAGE_KEY = "cg1618:theme";
const ThemeContext = createContext(null);

function readStored() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo(() => {
    function setTheme(next) {
      setPreference(next);
      try {
        if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
        else localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* storage unavailable: the choice lasts for this session */
      }
    }
    return {
      theme, // "light" | "dark" - what is on screen
      preference, // "light" | "dark" | "system" - what the user chose
      setTheme,
      toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
    };
  }, [theme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** The current theme name, "light" when rendered without a provider (leaf
 *  components tested in isolation, e.g. the relations canvas). */
export function useThemeOrLight() {
  return useContext(ThemeContext)?.theme ?? "light";
}
