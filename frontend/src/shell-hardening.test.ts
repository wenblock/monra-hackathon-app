import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("shell hardening assets", () => {
  it("includes production metadata in index.html", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain('name="description"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
  });

  it("uses local font delivery and reduced-motion aware scrolling", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).not.toContain("@import url(");
    expect(css).toContain('@font-face');
    expect(css).toContain('local("Geist")');
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
