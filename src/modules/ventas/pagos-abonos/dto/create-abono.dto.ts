// import { Type } from 'class-transformer';
// import { IsDateString, IsInt, IsNumber, Min } from 'class-validator';

// export class CreateAbonoDto {
//   @IsDateString()
//   fecha_pago: string;

//   @Type(() => Number)
//   @IsNumber()
//   @Min(0.01)
//   valor: number;

//   @Type(() => Number)
//   @IsInt()
//   @Min(1)
//   id_metodo: number;
// }

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsPositive,
} from 'class-validator';

export class CreateAbonoDto {
  @IsDateString()
  fecha_pago: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  @Type(() => Number)
  @IsInt()
  id_metodo: number;
}