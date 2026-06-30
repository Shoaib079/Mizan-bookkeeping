/** Account menu helpers — testable logic for Slice 12.0b. */

export function switchConfirmMessage(fromName: string, toName: string): string {
  return `Switch to ${toName}? You're currently in ${fromName}.`;
}

export function unsavedWorkWarningMessage(): string {
  return "You have unsaved changes. Leave anyway?";
}

export function recordingForLabel(restaurantName: string): string {
  return `Recording for: ${restaurantName}`;
}

export function devModeIdentityLabel(): string {
  return "Dev mode — not signed in";
}
