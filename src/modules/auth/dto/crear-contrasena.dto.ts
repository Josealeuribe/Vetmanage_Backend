import { IsString, Length, MinLength } from 'class-validator';

export class CrearContrasenaDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  @Length(6, 255)
  contrasena: string;
}
