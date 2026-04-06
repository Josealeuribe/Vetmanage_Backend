import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min, ValidateNested } from 'class-validator';
import { LoteRemisionVentaDto } from './lote-remision-venta.dto';

export class DetalleRemisionVentaItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoteRemisionVentaDto)
  lotes: LoteRemisionVentaDto[];
}