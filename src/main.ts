import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  // bodyParser: false is required — @thallesp/nestjs-better-auth manages
  // body parsing itself and skips it for /api/auth/* routes automatically.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
