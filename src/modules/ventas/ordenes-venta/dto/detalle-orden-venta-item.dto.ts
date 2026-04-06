import { Type } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

export class DetalleOrdenVentaItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  precio_unitario: number;
}