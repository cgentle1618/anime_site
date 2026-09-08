// Frontend: layout component file for Layout.
import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Nav from "./Nav";
import Toast from "./Toast";

function ScrollButtons() {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    function onScroll() {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      setShowTop(scrollY > 300);
      setShowBottom(scrollY + windowHeight < docHeight - 300);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Square outline controls: icon-only, so the icon is allowed.
  const btnClass =
    "w-9 h-9 bg-surface border border-border-strong text-text-muted flex items-center justify-center hover:border-text hover:text-text transition";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-1">
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className={btnClass}
        >
          <i className="fas fa-chevron-up text-xs"></i>
        </button>
      )}
      {showBottom && (
        <button
          onClick={() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: "smooth",
            })
          }
          aria-label="Scroll to bottom"
          className={btnClass}
        >
          <i className="fas fa-chevron-down text-xs"></i>
        </button>
      )}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="bg-canvas text-text min-h-screen flex flex-col font-sans">
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-surface border-t border-border mt-auto shrink-0">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            © 2026 CG1618 tracker. All rights reserved.
          </p>
        </div>
      </footer>
      <Toast />
      <ScrollButtons />
    </div>
  );
}
