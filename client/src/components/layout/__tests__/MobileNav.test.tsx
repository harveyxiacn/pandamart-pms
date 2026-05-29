import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileNav } from "../MobileNav";
import { useAuthStore } from "../../../store/authStore";

describe("MobileNav", () => {
  afterEach(() => {
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
  });

  it("hides dashboard entry for staff", () => {
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
        <MobileNav />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: "首页" })).not.toBeInTheDocument();
  });
});
