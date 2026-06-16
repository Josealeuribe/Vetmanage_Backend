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

export class CrearUsuarioDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, {
    message: 'El nombre solo permite letras',
  })
  nombre: string;

  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, {
    message: 'El apellido solo permite letras',
  })
  apellido: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_tipo_doc: number;

  @IsString()
  @Length(6, 15)
  @Matches(/^[0-9]+$/, {
    message: 'El número de documento solo permite números',
  })
  num_documento: string;

  @IsEmail()
  @Length(3, 100)
  email: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_rol: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsDateString()
  fecha_nacimiento: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  img_url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_genero?: number;
}