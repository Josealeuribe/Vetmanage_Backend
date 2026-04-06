import { Type } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

export class LoteRemisionVentaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_existencia: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  cantidad: number;
}