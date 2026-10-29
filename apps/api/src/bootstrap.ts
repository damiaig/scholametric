import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

/** Shared by main.ts and the e2e test bootstrap so both exercise identical request handling. */
export function configureApp(app: INestApplication, configService: ConfigService): void {
  app.use(helmet());
  // v0.8.5 step 1 (SPEC_V0.8.5.md §4) — credentials:true is required for
  // the refresh cookie to flow at all (the browser won't send or store a
  // Set-Cookie from a cross-origin fetch without it, even same-site across
  // ports like dev's 5173 -> 3000); CORS_ORIGIN must stay a single
  // explicit origin, never "*" — the two are mutually exclusive by spec.
  app.enableCors({ origin: configService.get<string>("CORS_ORIGIN"), credentials: true });
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
