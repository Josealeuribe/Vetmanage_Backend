import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GeneroService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.genero.findMany({
      orderBy: { id_genero: 'asc' },
      select: {
        id_genero: true,
        nombre_genero: true,
      },
    });
  }
}
