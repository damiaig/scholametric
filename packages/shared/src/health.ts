export interface HealthResponse {
  status: "ok" | "error";
  db: boolean;
  redis: boolean;
}
