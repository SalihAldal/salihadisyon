import { IsIn } from "class-validator";
import { staffResources, type StaffResource } from "../staff.resources";

export class StaffResourceParamDto {
  @IsIn(staffResources)
  resource!: StaffResource;
}
