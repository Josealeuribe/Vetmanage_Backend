import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, {
    message: 'El nombre solo permite letras',
  })
  nombre?: string;

  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, {
    message: 'El apellido solo permite letras',
  })
  apellido?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_tipo_doc?: number;

  @IsOptional()
  @IsString()
  @Length(6, 15)
  @Matches(/^[0-9]+$/, {
    message: 'El número de documento solo permite números',
  })
  num_documento?: string;

  @IsOptional()
  @IsEmail()
  @Length(3, 100)
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_rol?: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  @IsOptional()
  @IsDateString()
  fecha_nacimiento?: string | null;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  img_url?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_genero?: number | null;
}