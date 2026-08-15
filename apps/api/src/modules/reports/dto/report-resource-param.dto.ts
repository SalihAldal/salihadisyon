import { IsIn } from "class-validator";
import { reportResources, type ReportResource } from "../reports.resources";

export class ReportResourceParamDto {
  @IsIn(reportResources)
  report!: ReportResource;
}
