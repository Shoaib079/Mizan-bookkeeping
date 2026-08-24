/** Public props for shared DateInput. */

import type { KeyboardEvent } from "react";

export type DateInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Off for report filters where today's date is normal (avoids clutter/overlap). */
  showLateNightHint?: boolean;
  /** Block calendar days after today — default for all posting/entry dates. */
  disableFuture?: boolean;
};
