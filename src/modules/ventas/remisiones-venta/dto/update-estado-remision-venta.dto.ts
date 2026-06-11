import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateEstadoRemisionVentaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_estado_remision_venta: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000000)
  firma_digital?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_firmante?: string;
}