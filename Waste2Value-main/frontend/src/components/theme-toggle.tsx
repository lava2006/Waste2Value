"use client";

import React from "react";
import { useTheme } from "./theme-provider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light and dark theme"
      className={`p-2 rounded-xl transition-all duration-200 border border-slate-200 dark:border-emerald-900/60 bg-white/80 dark:bg-emerald-950/40 text-slate-700 dark:text-emerald-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 transition-transform hover:-rotate-12" />
      )}
    </button>
  );
}
