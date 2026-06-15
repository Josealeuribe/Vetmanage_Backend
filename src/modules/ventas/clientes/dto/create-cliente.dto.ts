import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo_cliente?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  nombre_cliente: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  num_documento: string;

  @IsInt()
  @Min(1)
  id_tipo_cliente: number;

  @IsInt()
  @Min(1)
  id_municipio: number;

  @IsInt()
  @Min(1)
  id_tipo_doc: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsInt()
  @Min(1)
  id_bodega: number;
}
