"use client";

import React from "react";
import Link from "next/link";
import { FolderX, PlusCircle, RotateCcw } from "lucide-react";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionText,
  actionHref,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg-card/40 my-4">
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-mint mb-4">
        {icon || <FolderX className="w-6 h-6" />}
      </div>
      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="text-xs text-slate-500 dark:text-text-dark-secondary max-w-sm mt-1.5 mb-5 leading-relaxed">
        {description}
      </p>
      {actionText && actionHref && (
        <Link href={actionHref}>
          <Button size="sm" leftIcon={<PlusCircle className="w-4 h-4" />}>
            {actionText}
          </Button>
        </Link>
      )}
      {actionText && onAction && !actionHref && (
        <Button size="sm" onClick={onAction} leftIcon={<RotateCcw className="w-4 h-4" />}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
