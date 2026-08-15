import { IsIn } from "class-validator";
import { posSettingsResources, type PosSettingsResource } from "../pos-settings.resources";

export class ResourceParamDto {
  @IsIn(posSettingsResources)
  resource!: PosSettingsResource;
}
