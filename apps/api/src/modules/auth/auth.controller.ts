import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";

@Controller("auth")
@ScopeLevel("user")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Public()
  login(@Body() body: LoginDto, @Req() request: AppRequest) {
    return this.authService.login(body, request);
  }

  @Post("refresh")
  @Public()
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body);
  }

  @Post("logout")
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Get("me")
  me(@Req() request: AppRequest) {
    return this.authService.me(request.user!.userId);
  }
}
