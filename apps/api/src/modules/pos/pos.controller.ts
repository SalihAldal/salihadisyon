import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { PaymentRateLimitGuard } from "../../common/guards/payment-rate-limit.guard";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { AddTicketNoteDto } from "./dto/add-ticket-note.dto";
import { AddTicketItemDto } from "./dto/add-ticket-item.dto";
import { ApprovalRequestDto } from "./dto/approval-request.dto";
import { ApplyTicketDiscountDto } from "./dto/apply-ticket-discount.dto";
import { CollectPaymentDto } from "./dto/collect-payment.dto";
import { AdminPosConfigQueryDto } from "./dto/admin-pos-config-query.dto";
import { CloseRegisterDto } from "./dto/close-register.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreatePosExpenseDto } from "./dto/create-pos-expense.dto";
import { DrawerOpenDto } from "./dto/drawer-open.dto";
import { MergeTicketDto } from "./dto/merge-ticket.dto";
import { OpenRegisterDto } from "./dto/open-register.dto";
import { PosReportQueryDto } from "./dto/pos-report-query.dto";
import { PrinterDispatchDto } from "./dto/printer-dispatch.dto";
import { PrinterBridgeAckDto, PrinterConnectionTestDto, TicketPrintDispatchDto } from "./dto/print-routing.dto";
import { RefundTicketDto } from "./dto/refund-ticket.dto";
import { SplitTicketDto } from "./dto/split-ticket.dto";
import { SplitTicketByPersonDto } from "./dto/split-ticket-by-person.dto";
import { TransferTicketDto } from "./dto/transfer-ticket.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { UpdateTicketItemDto } from "./dto/update-ticket-item.dto";
import { VoidTicketDto } from "./dto/void-ticket.dto";
import { VoidTicketItemDto } from "./dto/void-ticket-item.dto";
import { ResolveApprovalDto } from "./dto/resolve-approval.dto";
import { PosService } from "./pos.service";

@Controller("pos")
@ScopeLevel("branch")
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get("tickets")
  @RequirePermissions("ticket.view")
  listTickets(@Query() query: Record<string, string | undefined>, @Req() request: AppRequest) {
    return this.posService.listTickets(this.getActor(request), query);
  }

  @Get("tickets/:ticketId")
  @RequirePermissions("ticket.view")
  detail(@Param("ticketId") ticketId: string, @Req() request: AppRequest) {
    return this.posService.getTicketDetail(ticketId, this.getActor(request));
  }

  @Get("tickets/:ticketId/events")
  @RequirePermissions("ticket.view")
  listTicketEvents(@Param("ticketId") ticketId: string, @Req() request: AppRequest) {
    return this.posService.listTicketEvents(ticketId, this.getActor(request));
  }

  @Get("catalog")
  @RequirePermissions("ticket.view")
  getCatalog(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.posService.getCatalog(this.getActor(request), branchId);
  }

  @Get("config")
  @RequirePermissions("ticket.view")
  getConfig(@Query() query: AdminPosConfigQueryDto, @Req() request: AppRequest) {
    return this.posService.getPosConfig(this.getActor(request), query.branchId, query.terminalId);
  }

  @Get("connections/status")
  @RequirePermissions("device.view")
  getConnectionStatus(@Query() query: AdminPosConfigQueryDto, @Req() request: AppRequest) {
    return this.posService.getTerminalConnectionStatus(this.getActor(request), query.branchId, query.terminalId);
  }

  @Get("tables")
  @RequirePermissions("ticket.view")
  getTables(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.posService.getTables(this.getActor(request), branchId);
  }

  @Get("reports/summary")
  @RequirePermissions("reports.view")
  getReportSummary(@Query() query: PosReportQueryDto, @Req() request: AppRequest) {
    return this.posService.getPosReportSummary(this.getActor(request), query);
  }

  @Get("reports/export")
  @RequirePermissions("reports.view")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportReportSummary(@Query() query: PosReportQueryDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Content-Disposition", "attachment; filename=pos-report-summary.csv");
    return this.posService.exportPosReportSummary(this.getActor(request), query);
  }

  @Get("pending-orders")
  @RequirePermissions("ticket.view")
  getPendingOrders(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.posService.getPendingOrders(this.getActor(request), branchId);
  }

  @Post("tickets")
  @RequirePermissions("ticket.manage")
  createTicket(@Body() body: CreateTicketDto, @Req() request: AppRequest) {
    return this.posService.createTicket(body, this.getActor(request));
  }

  @Patch("tickets/:ticketId")
  @RequirePermissions("ticket.manage")
  updateTicket(@Param("ticketId") ticketId: string, @Body() body: UpdateTicketDto, @Req() request: AppRequest) {
    return this.posService.updateTicket(ticketId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/items")
  @RequirePermissions("ticket.manage")
  addItem(@Param("ticketId") ticketId: string, @Body() body: AddTicketItemDto, @Req() request: AppRequest) {
    return this.posService.addItem(ticketId, body, this.getActor(request));
  }

  @Patch("tickets/:ticketId/items/:itemId")
  @RequirePermissions("ticket.manage")
  updateItem(@Param("ticketId") ticketId: string, @Param("itemId") itemId: string, @Body() body: UpdateTicketItemDto, @Req() request: AppRequest) {
    return this.posService.updateItem(ticketId, itemId, body, this.getActor(request));
  }

  @Delete("tickets/:ticketId/items/:itemId")
  @RequirePermissions("ticket.manage")
  removeItem(@Param("ticketId") ticketId: string, @Param("itemId") itemId: string, @Req() request: AppRequest) {
    return this.posService.removeItem(ticketId, itemId, this.getActor(request));
  }

  @Post("tickets/:ticketId/items/:itemId/void")
  @RequirePermissions("ticket.manage")
  voidItem(
    @Param("ticketId") ticketId: string,
    @Param("itemId") itemId: string,
    @Body() body: VoidTicketItemDto,
    @Req() request: AppRequest,
  ) {
    return this.posService.voidItem(ticketId, itemId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/notes")
  @RequirePermissions("ticket.manage")
  addNote(@Param("ticketId") ticketId: string, @Body() body: AddTicketNoteDto, @Req() request: AppRequest) {
    return this.posService.addNote(ticketId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/bill-request")
  @RequirePermissions("ticket.manage")
  requestBill(@Param("ticketId") ticketId: string, @Req() request: AppRequest) {
    return this.posService.requestBill(ticketId, this.getActor(request));
  }

  @Post("tickets/:ticketId/discounts")
  @RequirePermissions("ticket.manage")
  applyDiscount(@Param("ticketId") ticketId: string, @Body() body: ApplyTicketDiscountDto, @Req() request: AppRequest) {
    return this.posService.applyDiscount(ticketId, body, this.getActor(request));
  }

  @Post("payments")
  @RequirePermissions("payment.manage")
  @UseGuards(PaymentRateLimitGuard)
  collectPayment(@Body() body: CollectPaymentDto, @Req() request: AppRequest) {
    return this.posService.collectPayment(body, this.getActor(request));
  }

  @Post("register/open")
  @RequirePermissions("register.open")
  openRegister(@Body() body: OpenRegisterDto, @Req() request: AppRequest) {
    return this.posService.openRegister(body, this.getActor(request));
  }

  @Post("register/close")
  @RequirePermissions("register.close")
  closeRegister(@Body() body: CloseRegisterDto, @Req() request: AppRequest) {
    return this.posService.closeRegister(body, this.getActor(request));
  }

  @Post("expenses")
  @RequirePermissions("expense.manage")
  createExpense(@Body() body: CreatePosExpenseDto, @Req() request: AppRequest) {
    return this.posService.createExpense(body, this.getActor(request));
  }

  @Post("tickets/:ticketId/payments")
  @RequirePermissions("payment.manage")
  @UseGuards(PaymentRateLimitGuard)
  collectTicketPayment(@Param("ticketId") ticketId: string, @Body() body: Omit<CollectPaymentDto, "ticketId">, @Req() request: AppRequest) {
    return this.posService.collectPayment({ ...body, ticketId }, this.getActor(request));
  }

  @Post("tickets/:ticketId/split")
  @RequirePermissions("ticket.manage")
  splitTicket(@Param("ticketId") ticketId: string, @Body() body: SplitTicketDto, @Req() request: AppRequest) {
    return this.posService.splitTicket(ticketId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/split/by-person")
  @RequirePermissions("ticket.manage")
  splitTicketByPerson(@Param("ticketId") ticketId: string, @Body() body: SplitTicketByPersonDto, @Req() request: AppRequest) {
    return this.posService.splitTicketByPerson(ticketId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/merge")
  @RequirePermissions("table.merge")
  mergeTicket(@Param("ticketId") ticketId: string, @Body() body: MergeTicketDto, @Req() request: AppRequest) {
    return this.posService.mergeTickets(body, this.getActor(request), ticketId);
  }

  @Post("tickets/:ticketId/transfer")
  @RequirePermissions("table.transfer")
  transferTicket(@Param("ticketId") ticketId: string, @Body() body: TransferTicketDto, @Req() request: AppRequest) {
    return this.posService.transferTicket(ticketId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/void")
  @RequirePermissions("ticket.manage")
  voidTicket(@Param("ticketId") ticketId: string, @Body() body: VoidTicketDto, @Req() request: AppRequest) {
    return this.posService.voidTicket(ticketId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/refund")
  @RequirePermissions("ticket.refund")
  requestRefund(@Param("ticketId") ticketId: string, @Body() body: RefundTicketDto, @Req() request: AppRequest) {
    return this.posService.requestRefund(ticketId, body, this.getActor(request));
  }

  @Post("approvals")
  @RequirePermissions("ticket.manage")
  requestApproval(@Body() body: ApprovalRequestDto, @Req() request: AppRequest) {
    return this.posService.createApprovalRequest(body, this.getActor(request));
  }

  @Post("approvals/:approvalId/approve")
  @RequirePermissions("ticket.manage")
  approveApproval(@Param("approvalId") approvalId: string, @Body() body: ResolveApprovalDto, @Req() request: AppRequest) {
    return this.posService.approveApprovalRequest(approvalId, body, this.getActor(request));
  }

  @Post("approvals/:approvalId/reject")
  @RequirePermissions("ticket.manage")
  rejectApproval(@Param("approvalId") approvalId: string, @Body() body: ResolveApprovalDto, @Req() request: AppRequest) {
    return this.posService.rejectApprovalRequest(approvalId, body, this.getActor(request));
  }

  @Post("tickets/:ticketId/print-routing")
  @RequirePermissions("ticket.manage")
  dispatchTicketPrintRouting(
    @Param("ticketId") ticketId: string,
    @Body() body: TicketPrintDispatchDto,
    @Req() request: AppRequest,
  ) {
    return this.posService.dispatchTicketPrintRouting(ticketId, body, this.getActor(request));
  }

  @Post("printers/jobs/:jobId/ack")
  @RequirePermissions("ticket.manage")
  acknowledgePrintJob(@Param("jobId") jobId: string, @Body() body: PrinterBridgeAckDto, @Req() request: AppRequest) {
    return this.posService.acknowledgePrintJob(jobId, body, this.getActor(request));
  }

  @Post("printers/test-connection")
  @RequirePermissions("device.manage")
  testPrinterConnection(@Body() body: PrinterConnectionTestDto, @Req() request: AppRequest) {
    return this.posService.testPrinterConnection(body, this.getActor(request));
  }

  @Post("printers/dispatch")
  @RequirePermissions("ticket.manage")
  dispatchPrinter(@Body() body: PrinterDispatchDto, @Req() request: AppRequest) {
    return this.posService.dispatchPrinter(body, this.getActor(request));
  }

  @Post("printers/test")
  @RequirePermissions("device.manage")
  testPrinter(@Body() body: PrinterDispatchDto, @Req() request: AppRequest) {
    return this.posService.testPrinter(body, this.getActor(request));
  }

  @Post("drawer/open")
  @RequirePermissions("drawer.open")
  openDrawer(@Body() body: DrawerOpenDto, @Req() request: AppRequest) {
    return this.posService.openDrawer(body, this.getActor(request));
  }

  private getActor(request: AppRequest) {
    return {
      tenantId: request.scope!.tenantId,
      userId: request.user!.userId,
      branchIds: request.scope!.branchIds,
      role: request.user!.role,
      terminalId: request.user!.terminalId,
      permissions: request.user!.permissions,
      ipAddress: request.user!.ipAddress,
      userAgent: request.user!.userAgent,
      deviceInfo: request.user!.deviceInfo,
    };
  }
}
