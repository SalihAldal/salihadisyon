import { IsIn } from "class-validator";
import { accountingResources, type AccountingResource } from "../accounting.resources";

export class AccountingResourceParamDto {
  @IsIn(accountingResources)
  resource!: AccountingResource;
}
