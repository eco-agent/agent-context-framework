import { useEffect, useRef } from "react";

import { Input } from "./components/Input.js";

export type SetupSection = "components" | "review";

interface SetupSidebarProps {
  readonly activeSection: SetupSection;
  readonly query: string;
  readonly selectedCount: number;
  readonly onQueryChange: (value: string) => void;
  readonly onSectionChange: (section: SetupSection) => void;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="icon">
      <circle cx="8.5" cy="8.5" r="5.25" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  );
}

function ComponentsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="icon">
      <path d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="icon">
      <path d="M4 5.5h12M4 10h12M4 14.5h7" />
    </svg>
  );
}

export function SetupSidebar({
  activeSection,
  query,
  selectedCount,
  onQueryChange,
  onSectionChange,
}: SetupSidebarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <aside className="sidebar" aria-label="Setup navigation">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true">AC</span>
        <span>Agent Context</span>
      </div>

      <label className="search">
        <SearchIcon />
        <span className="sr-only">Search components</span>
        <Input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search components"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              onQueryChange("");
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              document.querySelector<HTMLInputElement>(".component-row .checkbox:not(:disabled)")?.focus();
            }
          }}
        />
        <kbd>/</kbd>
      </label>

      <nav className="sidebar__nav">
        <button
          type="button"
          className="sidebar__nav-item"
          data-active={activeSection === "components"}
          onClick={() => onSectionChange("components")}
        >
          <ComponentsIcon />
          <span>Components</span>
        </button>
        <button
          type="button"
          className="sidebar__nav-item"
          data-active={activeSection === "review"}
          onClick={() => onSectionChange("review")}
        >
          <ReviewIcon />
          <span>Review</span>
          {selectedCount > 0 ? <span className="count">{selectedCount}</span> : null}
        </button>
      </nav>

      <p className="sidebar__note">Local setup · loopback only</p>
    </aside>
  );
}
