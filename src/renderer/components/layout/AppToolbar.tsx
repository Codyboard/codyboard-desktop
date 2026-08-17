import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ViewTransitionLink } from "../navigation/ViewTransitionLink";

type Theme = "dark" | "light";

export interface AppToolbarProps {
  actions?: ReactNode;
  backTo?: string;
  className?: string;
  title: string;
}

export function AppToolbar({ actions, backTo, className = "", title }: AppToolbarProps) {
  return (
    <header className={`app-toolbar ${className}`.trim()}>
      <div className="app-toolbar-title">
        {backTo && (
          <ViewTransitionLink className="toolbar-back" to={backTo} aria-label="Back to devices">
            <ArrowLeft />
          </ViewTransitionLink>
        )}
        <strong>Codyboard</strong>
        <p>{title}</p>
      </div>
      <div className="app-toolbar-actions">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === "light" ? "light" : "dark");

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("codyboard-theme", nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`}
    >
      {theme === "dark" ? <Moon /> : <Sun />}
    </button>
  );
}
