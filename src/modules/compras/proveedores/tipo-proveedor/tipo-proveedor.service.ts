import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TipoProveedorService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tipo_proveedor.findMany({
      orderBy: { nombre_tipo_proveedor: 'asc' },
      select: {
        id_tipo_proveedor: true,
        nombre_tipo_proveedor: true,
      },
    });
  }
}
