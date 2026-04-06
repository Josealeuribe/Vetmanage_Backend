import { IsInt, Min } from 'class-validator';

export class UpdateEstadoCotizacionDto {
  @IsInt()
  @Min(1)
  id_estado_cotizacion: number;
}