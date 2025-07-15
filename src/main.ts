// src/main.ts
import 'reflect-metadata'; // Must be the first import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-GitHub-Event,X-Hub-Signature-256',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe());

  const port = process.env.PORT || 3019;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`GitHub OAuth URL: http://localhost:${port}/auth/github`);
}

bootstrap();