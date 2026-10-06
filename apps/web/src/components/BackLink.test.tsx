import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../test/render-with-providers";
import { BackLink } from "./BackLink";

afterEach(() => {
  cleanup();
});

// v0.8.3 step 4 (SPEC_V0.8.3.md §2.7, Item 7) — the one shared back-to-
// parent affordance. A real <Link>, not navigate(-1): renders its label
// and points at the exact `to` prop, nothing more.
describe("BackLink", () => {
  it("renders its label as a real link pointing at the given parent route", () => {
    renderWithProviders(<BackLink to="/students" label="Back to students" />);

    const link = screen.getByRole("link", { name: "Back to students" });
    expect(link).toHaveAttribute("href", "/students");
  });

  it("applies the caller's className — no baked-in margin of its own", () => {
    renderWithProviders(<BackLink to="/students" label="Back to students" className="mb-4" />);

    expect(screen.getByRole("link", { name: "Back to students" })).toHaveClass("mb-4");
  });

  it("omitting className renders with no margin class at all", () => {
    renderWithProviders(<BackLink to="/students" label="Back to students" />);

    const link = screen.getByRole("link", { name: "Back to students" });
    expect(link.className).not.toMatch(/\bm[bytlrx]?-/);
  });

  it("is icon-free — label text only, no svg", () => {
    renderWithProviders(<BackLink to="/students" label="Back to students" />);

    const link = screen.getByRole("link", { name: "Back to students" });
    expect(link.querySelector("svg")).not.toBeInTheDocument();
  });
});
