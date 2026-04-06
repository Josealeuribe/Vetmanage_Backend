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
import { DetalleRemisionVentaItemDto } from './detalle-remision-venta-item.dto';

export class CreateRemisionVentaDto {
  @IsDateString()
  fecha_creacion: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  observaciones?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_orden_venta: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_estado_remision_venta: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_usuario_creador: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleRemisionVentaItemDto)
  detalle: DetalleRemisionVentaItemDto[];
}