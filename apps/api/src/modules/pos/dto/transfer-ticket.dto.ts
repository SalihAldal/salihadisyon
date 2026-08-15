import { IsString } from "class-validator";

export class TransferTicketDto {
  @IsString()
  tableId!: string;
}
