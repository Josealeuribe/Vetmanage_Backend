import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CambiarEstadoRemisionCompraDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_estado_remision_compra: number;
}
