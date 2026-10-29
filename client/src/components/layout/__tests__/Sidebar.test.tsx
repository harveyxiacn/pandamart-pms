import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "../Sidebar";
import { useAuthStore } from "../../../store/authStore";

describe("Sidebar", () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: "test-token",
      user: {
        id: 1,
        username: "admin",
        displayName: "管理员",
        role: "admin",
        email: "admin@pandamart.com",
      },
    });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
  });

  it("highlights only scan menu on /invoices/scan", () => {
    render(
      <MemoryRouter initialEntries={["/invoices/scan"]}>
        <Sidebar />
      </MemoryRouter>
    );

    const scanLink = screen.getByRole("link", { name: "发票识别" });
    const listLink = screen.getByRole("link", { name: "发票列表" });

    expect(scanLink.getAttribute("aria-current")).toBe("page");
    expect(listLink.getAttribute("aria-current")).toBeNull();
  });

  it("hides dashboard and ai assistant links for staff", () => {
    useAuthStore.setState({
      token: "staff-token",
      user: {
        id: 2,
        username: "staff1",
        displayName: "店员",
        role: "staff",
        email: "staff1@pandamart.com",
      },
    });

    render(
      <MemoryRouter initialEntries={["/invoices/scan"]}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryAllByRole("link", { name: "仪表盘" })).toHaveLength(0);
    expect(screen.queryAllByRole("link", { name: "AI 助手" })).toHaveLength(0);
  });
});
