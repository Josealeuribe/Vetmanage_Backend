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

export class CreateOrdenVentaDto {
  @IsDateString()
  fecha_creacion: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(65535)
  descripcion?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cliente: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_bodega: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_estado_orden_venta: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_termino_pago: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_usuario: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cotizacion?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleOrdenVentaItemDto)
  detalle?: DetalleOrdenVentaItemDto[];
}