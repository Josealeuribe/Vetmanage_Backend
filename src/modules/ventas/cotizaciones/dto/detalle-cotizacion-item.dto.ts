import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class DetalleCotizacionItemDto {
  @IsInt()
  @Min(1)
  id_producto: number;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsNumber()
  @Min(0)
  precio_unitario: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_iva?: number;
}