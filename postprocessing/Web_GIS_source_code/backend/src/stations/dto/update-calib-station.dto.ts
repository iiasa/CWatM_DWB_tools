import { PartialType } from '@nestjs/mapped-types';
import { CreateCalibStationDto } from './create-calib-station.dto';

export class UpdateCalibStationDto extends PartialType(CreateCalibStationDto) {}
