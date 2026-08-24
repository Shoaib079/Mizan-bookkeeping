/** Phase union for close-day form → split → done. */

export type CashCloseDayPhase =
  | { kind: "form" }
  | {
      kind: "split";
      moneyAccountId: string;
      moneyAccountName: string;
      sessionDateDisplay: string;
    }
  | {
      kind: "done";
      moneyAccountName: string;
      leftKurus: number | null;
      sentKurus: number;
      destLabel: string | null;
    };
