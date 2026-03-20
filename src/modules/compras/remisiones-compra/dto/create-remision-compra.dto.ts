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
import { Transform, Type } from 'class-transformer';
import { CreateDetalleRemisionCompraDto } from './detalle-remision-item.dto';

export class CreateRemisionCompraDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_compra: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_proveedor: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_bodega: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_factura?: number;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleRemisionCompraDto)
  detalle_remision_compra: CreateDetalleRemisionCompraDto[];
}
