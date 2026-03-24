import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class IvaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.iva.findMany({
      orderBy: { id_iva: 'asc' },
      select: {
        id_iva: true,
        porcentaje: true,
      },
    });
  }

  async findOne(id: number) {
    const iva = await this.prisma.iva.findUnique({
      where: { id_iva: id },
      select: {
        id_iva: true,
        porcentaje: true,
      },
    });

    if (!iva) {
      throw new NotFoundException('IVA no encontrado');
    }

    return iva;
  }
}
