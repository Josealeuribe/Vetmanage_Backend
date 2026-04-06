import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateEstadoOrdenVentaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_estado_orden_venta: number;
}