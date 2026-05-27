import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { IvaService } from './iva.service';
import { CreateIvaDto } from './dto/create-iva.dto';

@Controller('iva')
export class IvaController {
  constructor(private readonly service: IvaService) {}

  @Post()
  create(@Body() dto: CreateIvaDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}