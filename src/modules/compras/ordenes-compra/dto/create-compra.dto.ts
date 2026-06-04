import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DetalleItemDto } from './detalle-item.dto';

export class CreateCompraDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_bodega?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_proveedor: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_termino_pago: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descripcion?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  detalle: DetalleItemDto[];
}
