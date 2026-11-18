import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { AppLogger } from './common/logger/app-logger.js';
import { requestContext } from './common/request-context.middleware.js';
import { createValidationPipe } from './common/validation.js';

async function bootstrap() {
  const logger = new AppLogger(process.env.SERVICE_NAME ?? 'payments', process.env.LOG_LEVEL ?? 'info');
  const app = await NestFactory.create(AppModule, { logger });

  app.use(requestContext);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Solo para desarrollo sin gateway. Detrás de Nginx/Vite no hace falta CORS.
  if (process.env.CORS_ORIGIN) app.enableCors({ origin: process.env.CORS_ORIGIN.split(',') });

  const port = Number(process.env.PORT);
  await app.listen(port);
  logger.log(`Escuchando en el puerto ${port}`, 'Bootstrap');
}

await bootstrap();

