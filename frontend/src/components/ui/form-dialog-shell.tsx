"use client";

/** Wraps form content in Dialog unless embedded in a parent modal. */

import type { ReactNode } from "react";

import { Dialog } from "@/components/ui/dialog";

type Props = {
  embedded?: boolean;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function FormDialogShell({
  embedded,
  open,
  title,
  onClose,
  children,
}: Props) {
  if (embedded) return children;
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {children}
    </Dialog>
  );
}
