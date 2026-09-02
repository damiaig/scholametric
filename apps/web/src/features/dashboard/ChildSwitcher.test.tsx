import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyProfile } from "@scholametric/shared";
import { ChildSwitcher } from "./ChildSwitcher";

const CHILDREN: MyProfile[] = [
  { studentId: "child-1", firstName: "Kemi", lastName: "Okafor", admissionNumber: "SUN/1", gender: "FEMALE", dateOfBirth: "2014-01-01", status: "ACTIVE", currentClassArmLabel: "JSS 1 A" },
  { studentId: "child-2", firstName: "Tunde", lastName: "Okafor", admissionNumber: "SUN/2", gender: "MALE", dateOfBirth: "2012-01-01", status: "ACTIVE", currentClassArmLabel: null },
];

afterEach(() => {
  cleanup();
});

describe("ChildSwitcher", () => {
  it("renders only the caller's own already-fetched children — never fetches or validates anything itself", () => {
    render(<ChildSwitcher children={CHILDREN} selectedChildId="child-1" onSelect={vi.fn()} />);

    expect(screen.getByText("Kemi Okafor")).toBeInTheDocument();
    expect(screen.getByText("JSS 1 A")).toBeInTheDocument();
    expect(screen.getByText("Tunde Okafor")).toBeInTheDocument();
  });

  it("marks the selected child (aria-pressed) and calls onSelect with the tapped child's id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ChildSwitcher children={CHILDREN} selectedChildId="child-1" onSelect={onSelect} />);

    const kemiButton = screen.getByRole("button", { name: /Kemi Okafor/ });
    const tundeButton = screen.getByRole("button", { name: /Tunde Okafor/ });
    expect(kemiButton).toHaveAttribute("aria-pressed", "true");
    expect(tundeButton).toHaveAttribute("aria-pressed", "false");

    await user.click(tundeButton);
    expect(onSelect).toHaveBeenCalledWith("child-2");
  });

  it("renders nothing (not an empty box) when there are no children", () => {
    const { container } = render(<ChildSwitcher children={[]} selectedChildId="" onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
