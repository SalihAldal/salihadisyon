import { IsIn, IsOptional, IsString } from "class-validator";

export class PrinterDispatchDto {
  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsString()
  printerId!: string;

  @IsIn(["receipt", "kitchen", "label"])
  documentType!: "receipt" | "kitchen" | "label";

  @IsOptional()
  @IsString()
  content?: string;
}
