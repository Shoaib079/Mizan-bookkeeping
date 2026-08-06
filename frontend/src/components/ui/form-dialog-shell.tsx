"use client";

/** Wraps form content in Dialog unless embedded in a parent modal. */

import type { MutableRefObject, ReactNode } from "react";
import { useRef } from "react";

import { Dialog } from "@/components/ui/dialog";

type Props = {
  embedded?: boolean;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  dirty?: boolean;
  onDiscard?: () => void;
  closeRef?: MutableRefObject<(() => void) | undefined>;
};

export function FormDialogShell({
  embedded,
  open,
  title,
  onClose,
  children,
  dirty = false,
  onDiscard,
  closeRef: externalCloseRef,
}: Props) {
  const internalCloseRef = useRef<(() => void) | undefined>(undefined);
  const closeRef = externalCloseRef ?? internalCloseRef;

  if (embedded) return children;
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      dirty={dirty}
      onDiscard={onDiscard}
      onCloseRef={closeRef}
    >
      {children}
    </Dialog>
  );
}
