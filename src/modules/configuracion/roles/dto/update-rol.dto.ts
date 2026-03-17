import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRolDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  nombre_rol?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @MinLength(10)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids_permisos?: number[];
}
