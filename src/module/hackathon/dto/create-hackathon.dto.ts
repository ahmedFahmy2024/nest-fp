import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinDate,
  MinLength,
} from 'class-validator';

export class CreateHackathonDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description?: string;

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), {
    message: 'startDate must be a future date',
  })
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), {
    message: 'endDate must be a future date',
  })
  endDate: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
