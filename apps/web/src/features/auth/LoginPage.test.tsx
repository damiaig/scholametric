import type { ReactElement } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "./LoginPage";
import * as api from "../../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  it("renders the login shell with school, email, and password fields", () => {
    vi.spyOn(api, "fetchHealth").mockResolvedValue({ status: "ok", db: true, redis: true });

    renderWithQueryClient(<LoginPage />);

    expect(screen.getByText("Sign in to ScholaMetric")).toBeInTheDocument();
    expect(screen.getByLabelText("School")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the API-reachable badge once the mocked health check resolves", async () => {
    vi.spyOn(api, "fetchHealth").mockResolvedValue({ status: "ok", db: true, redis: true });

    renderWithQueryClient(<LoginPage />);

    expect(await screen.findByText("API reachable")).toBeInTheDocument();
  });

  it("shows the API-unreachable badge when the mocked health check fails", async () => {
    vi.spyOn(api, "fetchHealth").mockRejectedValue(new Error("network error"));

    renderWithQueryClient(<LoginPage />);

    expect(await screen.findByText("API unreachable")).toBeInTheDocument();
  });
});
