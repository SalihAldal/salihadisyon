import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { BackupService } from "./backup.service";
import { CreateSystemBackupDto } from "./dto/create-system-backup.dto";
import { RestoreSystemBackupDto } from "./dto/restore-system-backup.dto";

@Controller("system/backups")
@ScopeLevel("tenant")
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @RequirePermissions("subscription.manage")
  list(@Req() request: AppRequest) {
    return this.backupService.listBackups(request.user!);
  }

  @Post()
  @RequirePermissions("subscription.manage")
  create(@Body() dto: CreateSystemBackupDto, @Req() request: AppRequest) {
    return this.backupService.createManualBackup(dto, request.user!);
  }

  @Post("restore")
  @RequirePermissions("subscription.manage")
  restore(@Body() dto: RestoreSystemBackupDto, @Req() request: AppRequest) {
    return this.backupService.restoreBackup(dto, request.user!);
  }
}
