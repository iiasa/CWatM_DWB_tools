import { PartialType } from '@nestjs/mapped-types';
import { CreateSubbasinDto } from './create-subbasin.dto';

export class UpdateSubbasinDto extends PartialType(CreateSubbasinDto) {}

