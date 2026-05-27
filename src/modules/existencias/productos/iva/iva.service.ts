import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateIvaDto } from './dto/create-iva.dto';

@Injectable()
export class IvaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIvaDto) {
    const porcentaje = Number(dto.porcentaje);

    if (!Number.isFinite(porcentaje)) {
      throw new BadRequestException('El porcentaje del IVA no es válido');
    }

    const existente = await this.prisma.iva.findFirst({
      where: {
        porcentaje,
      },
      select: {
        id_iva: true,
        porcentaje: true,
      },
    });

    if (existente) {
      throw new ConflictException(`Ya existe un IVA del ${porcentaje}%`);
    }

    return this.prisma.iva.create({
      data: {
        porcentaje,
      },
      select: {
        id_iva: true,
        porcentaje: true,
      },
    });
  }

  async findAll() {
    return this.prisma.iva.findMany({
      orderBy: { porcentaje: 'asc' },
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