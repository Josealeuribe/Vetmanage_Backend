import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';
import { DashboardResumenQueryDto } from './dto/dashboard-resumen-query.dto';

interface DashboardAuthUser {
  id_usuario: number;
  email: string;
  id_rol: number;
  id_bodega_activa?: number | null;
  rol: string;
  permisos: string[];
}

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('resumen')
  async getResumen(
    @Query() query: DashboardResumenQueryDto,
    @Req() req: { user: DashboardAuthUser },
  ) {
    return this.dashboardService.getResumen(query, req.user);
  }
}