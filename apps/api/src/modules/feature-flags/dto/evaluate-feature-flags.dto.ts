import { IsIn, IsOptional } from "class-validator";
import { featureFlagClients, type FeatureFlagClient } from "@adisyon/config";

export class EvaluateFeatureFlagsDto {
  @IsOptional()
  @IsIn(featureFlagClients)
  client?: FeatureFlagClient;
}
