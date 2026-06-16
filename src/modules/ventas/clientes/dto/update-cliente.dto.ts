import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_cliente?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(50)
  num_documento?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_tipo_cliente?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_municipio?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_tipo_doc?: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_bodega?: number;
}
