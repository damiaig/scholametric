import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({ origin: configService.get<string>("CORS_ORIGIN") });
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });

  const port = configService.get<number>("PORT") ?? 3000;
  await app.listen(port);
}

bootstrap();
