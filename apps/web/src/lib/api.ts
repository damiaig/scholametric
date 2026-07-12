import type { HealthResponse } from "@scholametric/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error("Health check request failed");
  }
  return response.json() as Promise<HealthResponse>;
}
