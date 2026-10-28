import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  it("renders button text", () => {
    render(<Button>保存</Button>);
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(<Button variant="danger">删除</Button>);
    const button = screen.getByRole("button", { name: "删除" });
    expect(button.className).toContain("bg-danger");
  });
});
