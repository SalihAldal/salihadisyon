import { IsString } from "class-validator";

export class EmployeeIdParamDto {
  @IsString()
  id!: string;
}
