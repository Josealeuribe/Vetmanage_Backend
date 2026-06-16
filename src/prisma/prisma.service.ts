import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    let config: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      connectionLimit: number;
      ssl?: boolean | { rejectUnauthorized: boolean };
    };

    if (databaseUrl) {
      const url = new URL(databaseUrl);

      config = {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace('/', ''),
        connectionLimit: 5,
        ssl:
          url.searchParams.get('ssl') === 'true' ||
          url.searchParams.get('ssl-mode') === 'REQUIRED'
            ? { rejectUnauthorized: false }
            : undefined,
      };
    } else {
      config = {
        host: process.env.DATABASE_HOST ?? '127.0.0.1',
        port: Number(process.env.DATABASE_PORT ?? 3306),
        user: process.env.DATABASE_USER ?? 'root',
        password: process.env.DATABASE_PASSWORD ?? '',
        database: process.env.DATABASE_NAME ?? 'vetmanage',
        connectionLimit: 5,
      };
    }

    const adapter = new PrismaMariaDb(config);

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}