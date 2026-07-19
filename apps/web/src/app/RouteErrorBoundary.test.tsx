import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("RouteErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <RouteErrorBoundary>
        <div>All good</div>
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches a render crash and shows a friendly message instead of a blank page", () => {
    // React logs the error to console during the throw — expected noise,
    // not a real test failure.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <RouteErrorBoundary>
        <Bomb />
      </RouteErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });

  it("Try again resets the boundary so it re-renders children on the next attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    let shouldThrow = true;
    function MaybeBomb() {
      if (shouldThrow) throw new Error("boom");
      return <div>Recovered</div>;
    }

    render(
      <RouteErrorBoundary>
        <MaybeBomb />
      </RouteErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
