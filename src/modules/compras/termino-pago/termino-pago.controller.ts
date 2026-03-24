import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TerminoPagoService } from './termino-pago.service';

@UseGuards(AuthGuard('jwt'))
@Controller('termino-pago')
export class TerminoPagoController {
  constructor(private readonly terminoPagoService: TerminoPagoService) {}

  @Get()
  findAll() {
    return this.terminoPagoService.findAll();
  }
}
