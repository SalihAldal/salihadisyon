import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { CommonModule } from "./common/common.module";
import { JwtAccessGuard } from "./common/auth/jwt-access.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ApiRateLimitGuard } from "./common/guards/api-rate-limit.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { SubscriptionGuard } from "./common/guards/subscription.guard";
import { TenantScopeGuard } from "./common/guards/tenant-scope.guard";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { IdempotencyInterceptor } from "./common/interceptors/idempotency.interceptor";
import { RequestContextInterceptor } from "./common/interceptors/request-context.interceptor";
import { RequestRateLimitService } from "./common/security/request-rate-limit.service";
import { AuthModule } from "./modules/auth/auth.module";
import { IamModule } from "./modules/iam/iam.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { PosModule } from "./modules/pos/pos.module";
import { MenuModule } from "./modules/menu/menu.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { TablesModule } from "./modules/tables/tables.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { StaffModule } from "./modules/staff/staff.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
import { AuditModule } from "./modules/audit/audit.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { PosSettingsModule } from "./modules/pos-settings/pos-settings.module";
import { SupportModule } from "./modules/support/support.module";
import { PosIntegrationsModule } from "./modules/pos-integrations/pos-integrations.module";
import { BackupModule } from "./modules/backup/backup.module";
import { FeatureFlagsModule } from "./modules/feature-flags/feature-flags.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";

@Module({
  imports: [
    CommonModule,
    AuthModule,
    IamModule,
    DashboardModule,
    PosModule,
    MenuModule,
    CampaignsModule,
    TablesModule,
    CustomersModule,
    StaffModule,
    AttendanceModule,
    AccountingModule,
    InventoryModule,
    ReportsModule,
    IntegrationsModule,
    SubscriptionsModule,
    AuditModule,
    NotificationsModule,
    CompaniesModule,
    BranchesModule,
    PosSettingsModule,
    SupportModule,
    PosIntegrationsModule,
    BackupModule,
    FeatureFlagsModule,
    MonitoringModule,
  ],
  providers: [
    Reflector,
    RequestRateLimitService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ApiRateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAccessGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantScopeGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
