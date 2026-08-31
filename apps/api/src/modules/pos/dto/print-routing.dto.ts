import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class TicketPrintDispatchDto {
  @IsIn(["production", "receipt"])
  trigger!: "production" | "receipt";

  @IsString()
  @MinLength(8)
  printBatchId!: string;

  @IsOptional()
  @IsUUID()
  retryJobId?: string;
}

export class PrinterConnectionTestDto {
  @IsString()
  @MinLength(1)
  printerName!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class PrinterBridgeAckDto {
  @IsUUID()
  jobId!: string;

  @IsIn(["sent", "failed"])
  status!: "sent" | "failed";

  @IsOptional()
  @IsString()
  error?: string;
}

export class SaveCategoryPrintRoutingDto {
  @IsString({ each: true })
  destinationIds!: string[];
}

export class SaveProductPrintRoutingDto {
  @IsBoolean()
  useCategoryRouting!: boolean;

  @IsOptional()
  @IsString({ each: true })
  destinationIds?: string[];
}
