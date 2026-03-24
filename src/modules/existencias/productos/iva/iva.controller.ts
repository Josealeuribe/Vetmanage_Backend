import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { IvaService } from './iva.service';

@Controller('iva')
export class IvaController {
  constructor(private readonly service: IvaService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
