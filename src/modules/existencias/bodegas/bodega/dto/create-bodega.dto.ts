import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBodegaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre_bodega: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  direccion: string;

  @IsInt()
  @Min(1)
  id_municipio: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
