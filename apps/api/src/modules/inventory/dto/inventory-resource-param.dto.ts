import { IsIn } from "class-validator";
import { inventoryResources, type InventoryResource } from "../inventory.resources";

export class InventoryResourceParamDto {
  @IsIn(inventoryResources)
  resource!: InventoryResource;
}
