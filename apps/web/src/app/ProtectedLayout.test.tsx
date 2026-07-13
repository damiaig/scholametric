import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "../test/render-with-providers";
import { authStore } from "../lib/auth-store";
import { ProtectedLayout } from "./ProtectedLayout";

describe("ProtectedLayout", () => {
  afterEach(() => {
    cleanup();
    authStore.clear();
  });

  it("redirects an unauthenticated visitor to /login instead of rendering the protected route", () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>Login page marker</div>} />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<div>Dashboard marker</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    expect(screen.getByText("Login page marker")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard marker")).not.toBeInTheDocument();
  });
});
