import { PartialType } from "@nestjs/mapped-types";
import { CreateEmployeePaymentDto } from "./create-employee-payment.dto";

export class UpdateEmployeePaymentDto extends PartialType(CreateEmployeePaymentDto) {}
