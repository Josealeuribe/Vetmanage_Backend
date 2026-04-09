export class DashboardResumenBodegaDto {
  id_bodega: number | null;
  nombre_bodega: string;
  ids_bodegas: number[];
  total_bodegas: number;
}

export class DashboardResumenPeriodoDto {
  etiqueta: string;
  fecha_inicio: string;
  fecha_fin: string;
}

export class DashboardResumenVentasDto {
  total_mes_actual: number;
  cotizaciones_pendientes: number;
  ordenes_pendientes: number;
  remisiones_pendientes_facturar: number;
  facturas_pendientes_cobro: number;
  saldo_pendiente_cobro: number;
}

export class DashboardResumenComprasDto {
  total_mes_actual: number;
  ordenes_pendientes: number;
  remisiones_pendientes: number;
}

export class DashboardResumenInventarioDto {
  productos_con_stock: number;
  productos_stock_bajo: number;
  lotes_por_vencer: number;
  umbral_stock_bajo: number;
}

export class DashboardResumenTercerosDto {
  clientes_activos: number;
  proveedores_activos: number;
}

export class DashboardResumenLogisticaDto {
  traslados_pendientes: number;
}

export class DashboardResumenResponseDto {
  bodega: DashboardResumenBodegaDto;
  periodo: DashboardResumenPeriodoDto;
  ventas: DashboardResumenVentasDto;
  compras: DashboardResumenComprasDto;
  inventario: DashboardResumenInventarioDto;
  terceros: DashboardResumenTercerosDto;
  logistica: DashboardResumenLogisticaDto;
}