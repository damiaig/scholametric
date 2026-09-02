import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Award } from "lucide-react";
import { StatCard } from "./stat-card";

afterEach(() => {
  cleanup();
});

describe("StatCard", () => {
  it("renders the icon, label, and value; defaults to the primary tone", () => {
    const { container } = render(<StatCard icon={Award} label="Your average /100" value="65" />);
    expect(screen.getByText("Your average /100")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(container.querySelector(".bg-primary\\/10")).not.toBeNull();
  });

  it("applies the requested tone (secondary/accent)", () => {
    const { container: secondary } = render(<StatCard icon={Award} label="L" value="V" tone="secondary" />);
    expect(secondary.querySelector(".bg-secondary\\/10")).not.toBeNull();

    const { container: accent } = render(<StatCard icon={Award} label="L2" value="V2" tone="accent" />);
    expect(accent.querySelector(".bg-accent\\/10")).not.toBeNull();
  });

  it("accepts a ReactNode value, not just a string", () => {
    render(<StatCard icon={Award} label="Position" value={<span data-testid="pos">#2</span>} />);
    expect(screen.getByTestId("pos")).toHaveTextContent("#2");
  });
});
