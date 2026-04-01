import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DetalleOrdenVentaItemDto } from './detalle-orden-venta-item.dto';

export class UpdateOrdenVentaDto {
  @IsOptional()
  @IsDateString()
  fecha_creacion?: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(65535)
  descripcion?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cliente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_bodega?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_estado_orden_venta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_termino_pago?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_usuario?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cotizacion?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleOrdenVentaItemDto)
  detalle?: DetalleOrdenVentaItemDto[];
}