import { describe, expect, it } from "vitest";
import { resolveUploadPath } from "../tools";

describe("resolveUploadPath", () => {
  it("returns absolute Unix paths as-is", () => {
    expect(resolveUploadPath("/tmp/file.png", "./uploads")).toBe("/tmp/file.png");
    expect(resolveUploadPath("/var/log/test.pdf", "./uploads")).toBe("/var/log/test.pdf");
  });

  it("returns Windows absolute paths as-is", () => {
    expect(resolveUploadPath("C:\\Users\\test\\file.png", "./uploads")).toBe("C:\\Users\\test\\file.png");
    expect(resolveUploadPath("D:\\data\\document.pdf", "./uploads")).toBe("D:\\data\\document.pdf");
  });

  it("prefixes relative paths with uploadBasePath", () => {
    expect(resolveUploadPath("file.png", "./uploads")).toBe("./uploads/file.png");
    expect(resolveUploadPath("document.pdf", "./uploads")).toBe("./uploads/document.pdf");
  });

  it("uses custom uploadBasePath for relative paths", () => {
    expect(resolveUploadPath("file.png", "/custom/uploads")).toBe("/custom/uploads/file.png");
    expect(resolveUploadPath("test.txt", "uploads")).toBe("uploads/test.txt");
  });

  it("handles mixed arrays correctly", () => {
    const paths = ["/tmp/a.png", "b.pdf", "C:\\data\\c.jpg"];
    const resolved = paths.map((p) => resolveUploadPath(p, "./uploads"));
    expect(resolved).toEqual(["/tmp/a.png", "./uploads/b.pdf", "C:\\data\\c.jpg"]);
  });

  it("handles relative paths with subdirectories", () => {
    expect(resolveUploadPath("folder/file.png", "./uploads")).toBe("./uploads/folder/file.png");
    expect(resolveUploadPath("uploads/test/document.pdf", "./uploads")).toBe("./uploads/uploads/test/document.pdf");
  });
});
