import { describe, expect, it } from "vitest";

import { formatFileSize } from "./file-upload";

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
