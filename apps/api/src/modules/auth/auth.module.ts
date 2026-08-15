import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAccessGuard } from "../../common/auth/jwt-access.guard";
import { SecurityRateLimitService } from "../../common/security/security-rate-limit.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard, SecurityRateLimitService],
  exports: [AuthService, JwtAccessGuard, JwtModule],
})
export class AuthModule {}
