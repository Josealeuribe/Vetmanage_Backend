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
import { Type } from 'class-transformer';
import { DetalleCotizacionItemDto } from './detalle-cotizacion-item.dto';

export class CreateCotizacionDto {
  @IsDateString()
  fecha: string;

  @IsDateString()
  fecha_vencimiento: string;

  @IsInt()
  @Min(1)
  id_cliente: number;

  @IsInt()
  @Min(1)
  id_bodega: number;

  @IsInt()
  @Min(1)
  id_usuario_creador: number;

  @IsInt()
  @Min(1)
  id_estado_cotizacion: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleCotizacionItemDto)
  detalle: DetalleCotizacionItemDto[];
}