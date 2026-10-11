import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "lime" | "ai";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-semibold transition-all duration-150 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

  const variantStyles = {
    primary:
      "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm hover:shadow-glow focus:ring-emerald-500 dark:focus:ring-offset-darkbg",
    lime:
      "bg-lime hover:bg-lime-500 text-forest-950 font-bold shadow-sm hover:shadow-glow-lime focus:ring-lime-400",
    ai:
      "bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white shadow-sm hover:shadow-glow-violet focus:ring-violet-500",
    secondary:
      "bg-emerald-100/70 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-mint border border-emerald-200/60 dark:border-emerald-800 focus:ring-emerald-500",
    outline:
      "border border-slate-300 dark:border-darkbg-border bg-transparent hover:bg-slate-50 dark:hover:bg-darkbg-hover text-slate-700 dark:text-text-dark-primary focus:ring-emerald-500",
    ghost:
      "bg-transparent hover:bg-slate-100 dark:hover:bg-darkbg-hover text-slate-600 dark:text-mint focus:ring-emerald-500",
    danger:
      "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm focus:ring-rose-500",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}
