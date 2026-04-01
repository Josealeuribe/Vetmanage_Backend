// import {
//     ArrayMinSize,
//     ArrayUnique,
//     IsArray,
//     IsDateString,
//     IsInt,
//     IsOptional,
//     IsString,
//     MaxLength,
//     Min,
//   } from 'class-validator';
//   import { Type } from 'class-transformer';
  
//   export class CreateFacturaDesdeRemisionesDto {
//     @IsDateString()
//     fecha_factura: string;
  
//     @IsOptional()
//     @IsDateString()
//     fecha_vencimiento?: string;
  
//     @IsOptional()
//     @IsString()
//     @MaxLength(255)
//     nota?: string;
  
//     @Type(() => Number)
//     @IsInt()
//     @Min(1)
//     id_cliente: number;
  
//     @IsArray()
//     @ArrayMinSize(1)
//     @ArrayUnique()
//     @Type(() => Number)
//     @IsInt({ each: true })
//     @Min(1, { each: true })
//     id_remisiones: number[];
//   }

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFacturaDesdeRemisionesDto {
  @Type(() => Number)
  @IsInt()
  id_cliente: number;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  id_remisiones: number[];

  @IsDateString()
  fecha_factura: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nota?: string;
}