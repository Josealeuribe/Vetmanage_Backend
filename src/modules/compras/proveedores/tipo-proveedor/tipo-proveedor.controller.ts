import { Controller, Get } from '@nestjs/common';
import { TipoProveedorService } from './tipo-proveedor.service';

@Controller('tipo-proveedor')
export class TipoProveedorController {
  constructor(private readonly service: TipoProveedorService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
