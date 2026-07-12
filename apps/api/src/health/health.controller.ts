import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@scholametric/shared";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
