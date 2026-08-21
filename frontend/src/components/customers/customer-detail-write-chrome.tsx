"use client";

import type { ReactNode } from "react";

import { EditTitleButton } from "@/components/page/page-header";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { Button } from "@/components/ui/button";

/** Customer detail write chrome — split for file-size ratchet (S3). */
export function customerDetailWriteChrome(props: {
  showWrite: boolean;
  entityId: string | null;
  customerId: string;
  balanceKurus: number;
  onPayment: () => void;
  onSale: () => void;
  onEdit: () => void;
  onWriteOff: () => void;
}): {
  primaryAction: ReactNode;
  actions: ReactNode;
  titleAction: ReactNode;
  overflowActions: {
    label: string;
    title?: string;
    show?: boolean;
    onSelect: () => void;
  }[];
} {
  const {
    showWrite,
    entityId,
    customerId,
    balanceKurus,
    onPayment,
    onSale,
    onEdit,
    onWriteOff,
  } = props;
  return {
    primaryAction: showWrite ? (
      <Button type="button" onClick={onPayment}>
        Record payment
      </Button>
    ) : undefined,
    actions: (
      <>
        {showWrite && (
          <Button type="button" variant="secondary" onClick={onSale}>
            Group sale
          </Button>
        )}
        <SubledgerDownloadMenu
          basePath={
            entityId
              ? `/entities/${entityId}/customers/${customerId}/ledger`
              : null
          }
        />
      </>
    ),
    titleAction: showWrite ? <EditTitleButton onClick={onEdit} /> : undefined,
    overflowActions: showWrite
      ? [
          {
            label: "Write off balance",
            title: "Write off part or all of the outstanding balance",
            show: balanceKurus > 0,
            onSelect: onWriteOff,
          },
        ]
      : [],
  };
}
