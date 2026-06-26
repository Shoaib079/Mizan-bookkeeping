/** Turkish TRY amount field — numeric-only input with optional live preview (Slice 11.3). */

import { forwardRef, useCallback } from "react";

import { Input } from "@/components/ui/input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { formatTry, parseTryToKurus, sanitizeTryInput } from "@/lib/money";
import { cn } from "@/lib/utils";

export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Show formatted TRY when parseable (default true). */
  showPreview?: boolean;
  /** Show invalid hint when non-empty but not parseable (default true). */
  showInvalidHint?: boolean;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    {
      value,
      onChange,
      showPreview = true,
      showInvalidHint = true,
      className,
      onPaste,
      ...props
    },
    ref,
  ) {
    const parsed = parseTryToKurus(value);
    const invalid = value.trim() !== "" && parsed === null;

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(sanitizeTryInput(event.target.value));
      },
      [onChange],
    );

    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLInputElement>) => {
        onPaste?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const pasted = event.clipboardData.getData("text");
        onChange(sanitizeTryInput(pasted));
      },
      [onChange, onPaste],
    );

    return (
      <div>
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cn(invalid && "border-destructive", className)}
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          aria-invalid={invalid || undefined}
          {...props}
        />
        {showInvalidHint && invalid && (
          <ValidationHint>Enter a valid amount (numbers only).</ValidationHint>
        )}
        {showPreview && parsed !== null && (
          <p className="mt-1 text-xs text-muted-foreground">{formatTry(parsed)}</p>
        )}
      </div>
    );
  },
);
