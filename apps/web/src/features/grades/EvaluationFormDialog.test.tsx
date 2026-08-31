import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Evaluation } from "@scholametric/shared";
import { renderWithProviders } from "../../test/render-with-providers";
import { authStore } from "../../lib/auth-store";
import { apiRequest } from "../../lib/api-client";
import { EvaluationFormDialog } from "./EvaluationFormDialog";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

const EXISTING: Evaluation = { id: "e1", name: "CA 1", description: "First continuous assessment", createdAt: "t", createdBy: "u1" };

beforeEach(() => {
  authStore.setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe("EvaluationFormDialog", () => {
  it("create mode: submits name/description merged with the locked classArmId/subjectId/termId, closes on success", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/grades/evaluations" && opts?.method === "POST") {
        expect(opts.body).toEqual({
          name: "Mid-term Test",
          description: "Covers chapters 1-4",
          classArmId: "arm1",
          subjectId: "sub1",
          termId: "term1",
        });
        return { id: "new1", name: "Mid-term Test", description: "Covers chapters 1-4", createdAt: "t", createdBy: "u1" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EvaluationFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" />);

    expect(screen.getByRole("heading", { name: "New evaluation" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Mid-term Test");
    await user.type(screen.getByLabelText("Description"), "Covers chapters 1-4");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("400s a blank name client-side (zod), without calling the API", async () => {
    mockedApiRequest.mockImplementation(async (path: string) => {
      throw new Error(`should not be called: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<EvaluationFormDialog open onClose={vi.fn()} classArmId="arm1" subjectId="sub1" termId="term1" />);

    await user.type(screen.getByLabelText("Description"), "Covers chapters 1-4");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("edit mode: prefills from the given evaluation and PATCHes only name/description", async () => {
    mockedApiRequest.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/api/v1/grades/evaluations/e1" && opts?.method === "PATCH") {
        expect(opts.body).toEqual({ name: "CA 1 (revised)", description: "First continuous assessment" });
        return { ...EXISTING, name: "CA 1 (revised)" };
      }
      throw new Error(`unexpected call: ${path} ${opts?.method ?? "GET"}`);
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EvaluationFormDialog open onClose={onClose} classArmId="arm1" subjectId="sub1" termId="term1" evaluation={EXISTING} />,
    );

    expect(screen.getByRole("heading", { name: "Edit evaluation" })).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await waitFor(() => expect(nameInput).toHaveValue("CA 1"));

    await user.clear(nameInput);
    await user.type(nameInput, "CA 1 (revised)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
