import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  console.log('🚀 INITIALIZING NESTJS APP...'); // Debug log
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Port:', process.env.PORT);

  const app = await NestFactory.create(AppModule);

  // CORS configuration - supports both local and production environments
  const allowedOrigins = [
    'http://localhost:4200',
    'http://localhost:4201',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:4201',
    'https://www.injoyplan.com',
    'https://injoyplan.com',
    'https://injoyplan.com/',
    'https://www.injoyplan.com/',
    'https://master.d2asj3nln890d2.amplifyapp.com',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if origin is explicitly allowed
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Dynamic check for Railway domains (frontend deployments)
      const railwayRegex = /^https:\/\/.*\.railway\.app$/;
      if (railwayRegex.test(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked by CORS: origin=${origin}`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Injoyplan API')
    .setDescription('API REST para la plataforma social Injoyplan')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 4201;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api-docs`);
}
bootstrap();
