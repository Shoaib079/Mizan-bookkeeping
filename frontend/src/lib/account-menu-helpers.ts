/** Account menu helpers — testable logic for Slice 12.0b. */

export function switchConfirmMessage(fromName: string, toName: string): string {
  return `Switch to ${toName}? You're currently in ${fromName}.`;
}

export function discardChangesTitle(): string {
  return "Discard unsaved changes?";
}

export function discardChangesMessage(): string {
  return "You have edits that have not been saved. Leaving now will discard them.";
}

export function discardChangesConfirmLabel(): string {
  return "Discard changes";
}

/** @deprecated Use discardChangesMessage — kept for account-menu copy parity. */
export function unsavedWorkWarningMessage(): string {
  return discardChangesMessage();
}

export function recordingForLabel(restaurantName: string): string {
  return `Recording for: ${restaurantName}`;
}

export function devModeIdentityLabel(): string {
  return "Dev mode — not signed in";
}
