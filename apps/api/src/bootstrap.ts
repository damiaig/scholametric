import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

/** Shared by main.ts and the e2e test bootstrap so both exercise identical request handling. */
export function configureApp(app: INestApplication, configService: ConfigService): void {
  app.use(helmet());
  app.enableCors({ origin: configService.get<string>("CORS_ORIGIN") });
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
