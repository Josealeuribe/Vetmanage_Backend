import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class DetalleItemDto {
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
  @Min(0)
  precio_unitario: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_iva?: number;
}