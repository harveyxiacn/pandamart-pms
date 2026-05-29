import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../pages/LoginPage";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

describe("LoginPage credential exposure", () => {
  it("does not prefill admin credentials or show default admin copy", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText("用户名") as HTMLInputElement;
    const passwordInput = screen.getByLabelText("密码") as HTMLInputElement;

    expect(usernameInput.value).toBe("");
    expect(passwordInput.value).toBe("");
    expect(screen.queryByText(/默认管理员/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CHANGE_ME_ON_FIRST_LOGIN/)).not.toBeInTheDocument();
  });
});
