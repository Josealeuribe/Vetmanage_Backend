import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class CreateIvaDto {
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El porcentaje debe ser un número válido' },
  )
  @Min(0, { message: 'El porcentaje no puede ser menor a 0' })
  @Max(100, { message: 'El porcentaje no puede ser mayor a 100' })
  porcentaje: number;
}