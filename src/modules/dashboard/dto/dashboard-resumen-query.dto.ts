import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class DashboardResumenQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  id_bodega?: number;
}