import { IsEmail, Length } from 'class-validator';

export class SolicitarRestablecimientoDto {
  @IsEmail()
  @Length(3, 100)
  email: string;
}
