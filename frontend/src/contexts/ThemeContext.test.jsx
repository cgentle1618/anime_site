import { act, render, screen } from "@testing-library/react";

import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
  const { theme, preference, toggle, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="pref">{preference}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setTheme("system")}>system</button>
    </div>
  );
}

let listeners;
function stubMatchMedia(matches) {
  listeners = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: (_, fn) => listeners.push(fn),
      removeEventListener: (_, fn) => listeners.splice(listeners.indexOf(fn), 1),
    }))
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

it("follows the OS when nothing is stored, and stamps <html data-theme>", () => {
  stubMatchMedia(true);
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId("theme").textContent).toBe("dark");
  expect(screen.getByTestId("pref").textContent).toBe("system");
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("a stored choice beats the OS", () => {
  stubMatchMedia(true);
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId("theme").textContent).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("toggle flips the theme and remembers it; system forgets it", () => {
  stubMatchMedia(false);
  render(<ThemeProvider><Probe /></ThemeProvider>);
  act(() => screen.getByText("toggle").click());
  expect(screen.getByTestId("theme").textContent).toBe("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");

  act(() => screen.getByText("system").click());
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  expect(screen.getByTestId("theme").textContent).toBe("light");
});

it("tracks OS changes while following the system", () => {
  stubMatchMedia(false);
  render(<ThemeProvider><Probe /></ThemeProvider>);
  act(() => listeners.forEach((fn) => fn({ matches: true })));
  expect(screen.getByTestId("theme").textContent).toBe("dark");
});
