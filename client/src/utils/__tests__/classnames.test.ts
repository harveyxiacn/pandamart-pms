import { describe, expect, it } from "vitest";
import { cn } from "../classnames";

describe("classnames util", () => {
  it("merges classes and resolves tailwind conflicts", () => {
    expect(cn("px-2", "px-4", "text-sm")).toBe("px-4 text-sm");
  });
});
