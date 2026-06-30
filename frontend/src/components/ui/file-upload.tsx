"use client";

import { FileText, Upload, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileUploadProps = {
  id?: string;
  accept?: string;
  disabled?: boolean;
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Short hint for accepted types, e.g. "PDF or XML". */
  acceptHint?: string;
  className?: string;
};

export function FileUpload({
  id: idProp,
  accept,
  disabled = false,
  file,
  onFileChange,
  acceptHint,
  className,
}: FileUploadProps) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const clearFile = useCallback(() => {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onFileChange]);

  const pickFile = useCallback(
    (next: File | null) => {
      onFileChange(next);
      if (!next && inputRef.current) inputRef.current.value = "";
    },
    [onFileChange],
  );

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0] ?? null);
  }

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    if (!disabled) setDragActive(true);
  }

  function onDragLeave(event: React.DragEvent) {
    event.preventDefault();
    setDragActive(false);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) pickFile(dropped);
  }

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={onInputChange}
      />

      {file ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5",
            disabled && "opacity-50",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {file.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 px-0"
            disabled={disabled}
            aria-label="Remove file"
            onClick={clearFile}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-labelledby={inputId}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPicker();
            }
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
            "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            dragActive && "border-primary bg-primary/5",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-5 w-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              <span className="font-medium text-primary">Browse</span>
              {" or drag a file here"}
            </p>
            {acceptHint ? (
              <p className="text-xs text-muted-foreground">{acceptHint}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
