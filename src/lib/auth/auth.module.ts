import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth';

// BetterAuthModule.forRoot registers:
//  - the /api/auth/* route handler (toNodeHandler under the hood)
//  - a global AuthGuard that protects every route by default
//  - body-parser skipping for auth routes
// Use @AllowAnonymous() on any route that should be public.
@Module({
  imports: [
    BetterAuthModule.forRoot({ auth }),
  ],
  exports: [BetterAuthModule],
})
export class AuthModule {}
