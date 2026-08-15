import { IsObject } from "class-validator";

export class UpdateStaffResourceDto {
  @IsObject()
  data!: Record<string, unknown>;
}
