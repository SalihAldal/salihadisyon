import { PartialType } from "@nestjs/mapped-types";
import { CreatePosDeviceDto } from "./create-pos-device.dto";

export class UpdatePosDeviceDto extends PartialType(CreatePosDeviceDto) {}
