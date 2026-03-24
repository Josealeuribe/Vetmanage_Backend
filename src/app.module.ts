import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExistenciasModule } from './modules/existencias/existencias.module';
import { DepartamentosModule } from './modules/existencias/bodegas/departamentos/departamentos.module';
import { MunicipiosModule } from './modules/existencias/bodegas/municipios/municipios.module';
import { ComprasModule } from './modules/compras/compras.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PermisosModule } from './modules/configuracion/permisos/permisos.module';
import { TipoProveedorModule } from './modules/tipo-proveedor/tipo-proveedor.module';
import { MunicipioModule } from './modules/municipios/municipio.module';
import { TipoDocumentoModule } from './modules/tipo-documento/tipo-documento.module';
import { TerminoPagoModule } from './modules/termino-pago/termino-pago.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // ✅ para leer .env (JWT_SECRET, etc.)
    PrismaModule,
    PermisosModule,
    AuthModule,
    ExistenciasModule,
    DepartamentosModule,
    MunicipiosModule,
    ComprasModule,
    VentasModule,
    ConfiguracionModule,
    UsuariosModule,
    PermisosModule,
    TipoDocumentoModule,
    TipoProveedorModule,
    MunicipioModule,
    TerminoPagoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
