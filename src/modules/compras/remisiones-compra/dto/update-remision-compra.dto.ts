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

export class UpdateRemisionCompraDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_factura?: number;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  observaciones?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleRemisionCompraDto)
  detalle_remision_compra?: CreateDetalleRemisionCompraDto[];
}
