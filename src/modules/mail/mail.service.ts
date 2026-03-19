import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type CrearContrasenaMailParams = {
  to: string;
  nombre: string;
  enlace: string;
};

type RestablecerContrasenaMailParams = {
  to: string;
  nombre: string;
  enlaceWeb: string;
  enlaceApp: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');
    const fromName = this.config.get<string>('MAIL_FROM_NAME') || 'VetManage';

    if (!user || !pass) {
      throw new Error('MAIL_USER y MAIL_PASS son obligatorios en el .env');
    }

    this.from = `"${fromName}" <${user}>`;

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    });
  }

  async enviarCreacionContrasena(params: CrearContrasenaMailParams) {
    const { to, nombre, enlace } = params;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Activa tu cuenta en VetManage',
      html: `
        <div style="margin:0; padding:0; background-color:#f4f7fb; width:100%;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7fb; margin:0; padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; background:#ffffff; border-radius:20px; overflow:hidden; border:1px solid #e5e7eb;">
                  
                  <tr>
                    <td style="background:linear-gradient(135deg, #0b1020 0%, #14213d 100%); padding:32px 28px; text-align:center;">
                      <div style="font-family:Arial, sans-serif; color:#ffffff; font-size:28px; font-weight:800; letter-spacing:0.5px;">
                        VetManage
                      </div>
                      <div style="font-family:Arial, sans-serif; color:#cbd5e1; font-size:14px; margin-top:8px;">
                        Gestión inteligente para tu operación
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:36px 32px 22px 32px; font-family:Arial, sans-serif; color:#1f2937;">
                      <h2 style="margin:0 0 12px 0; font-size:24px; line-height:1.3; color:#111827;">
                        Hola ${nombre},
                      </h2>

                      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.7; color:#4b5563;">
                        Tu cuenta en <strong>VetManage</strong> ha sido creada correctamente.
                      </p>

                      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.7; color:#4b5563;">
                        Para definir tu contraseña y activar el acceso, haz clic en el siguiente botón:
                      </p>

                      <div style="text-align:center; margin:30px 0;">
                        <a
                          href="${enlace}"
                          style="
                            background:#2563eb;
                            color:#ffffff;
                            text-decoration:none;
                            padding:14px 24px;
                            border-radius:12px;
                            display:inline-block;
                            font-size:15px;
                            font-weight:700;
                          "
                        >
                          Crear contraseña
                        </a>
                      </div>

                      <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:14px; padding:16px; margin:24px 0;">
                        <p style="margin:0; font-size:14px; line-height:1.6; color:#475569;">
                          Este enlace vence en <strong>24 horas</strong>. Si no reconoces esta acción, puedes ignorar este correo.
                        </p>
                      </div>

                      <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#6b7280;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:
                      </p>

                      <p style="margin:0; word-break:break-all; font-size:12px; line-height:1.6; color:#2563eb;">
                        ${enlace}
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:20px 32px 28px 32px; border-top:1px solid #e5e7eb; font-family:Arial, sans-serif;">
                      <p style="margin:0; font-size:12px; line-height:1.6; color:#94a3b8; text-align:center;">
                        VetManage · Este es un correo automático, por favor no respondas a este mensaje.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    });

    this.logger.log(`Correo de creación de contraseña enviado a ${to}`);
  }

  async enviarRestablecimientoContrasena(
    params: RestablecerContrasenaMailParams,
  ) {
    const { to, nombre, enlaceWeb, enlaceApp } = params;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Restablece tu contraseña en VetManage',
      html: `
        <div style="margin:0; padding:0; background-color:#f4f7fb; width:100%;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7fb; margin:0; padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; background:#ffffff; border-radius:20px; overflow:hidden; border:1px solid #e5e7eb;">
                  
                  <tr>
                    <td style="background:linear-gradient(135deg, #0b1020 0%, #14213d 100%); padding:32px 28px; text-align:center;">
                      <div style="font-family:Arial, sans-serif; color:#ffffff; font-size:28px; font-weight:800; letter-spacing:0.5px;">
                        VetManage
                      </div>
                      <div style="font-family:Arial, sans-serif; color:#cbd5e1; font-size:14px; margin-top:8px;">
                        Recuperación segura de acceso
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:36px 32px 22px 32px; font-family:Arial, sans-serif; color:#1f2937;">
                      <h2 style="margin:0 0 12px 0; font-size:24px; line-height:1.3; color:#111827;">
                        Hola ${nombre},
                      </h2>

                      <p style="margin:0 0 16px 0; font-size:15px; line-height:1.7; color:#4b5563;">
                        Recibimos una solicitud para restablecer tu contraseña en <strong>VetManage</strong>.
                      </p>

                      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.7; color:#4b5563;">
                        Puedes continuar el proceso desde la <strong>app móvil</strong> o desde la <strong>versión web</strong>.
                      </p>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 10px 0;">
                        <tr>
                          <td align="center" style="padding-bottom:12px;">
                            <a
                              href="${enlaceApp}"
                              style="
                                background:#2563eb;
                                color:#ffffff;
                                text-decoration:none;
                                padding:14px 24px;
                                border-radius:12px;
                                display:inline-block;
                                font-size:15px;
                                font-weight:700;
                                min-width:200px;
                              "
                            >
                              Abrir en la app
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td align="center">
                            <a
                              href="${enlaceWeb}"
                              style="
                                background:#111827;
                                color:#ffffff;
                                text-decoration:none;
                                padding:14px 24px;
                                border-radius:12px;
                                display:inline-block;
                                font-size:15px;
                                font-weight:700;
                                min-width:200px;
                              "
                            >
                              Abrir en la web
                            </a>
                          </td>
                        </tr>
                      </table>

                      <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:14px; padding:16px; margin:26px 0;">
                        <p style="margin:0; font-size:14px; line-height:1.6; color:#475569;">
                          Este enlace vence en <strong>24 horas</strong>. Si no solicitaste este cambio, puedes ignorar este correo con tranquilidad.
                        </p>
                      </div>

                      <p style="margin:0 0 10px 0; font-size:13px; line-height:1.6; color:#6b7280;">
                        Si tienes problemas con los botones, usa estos enlaces manuales:
                      </p>

                      <p style="margin:0 0 8px 0; word-break:break-all; font-size:12px; line-height:1.6; color:#2563eb;">
                        <strong style="color:#111827;">App:</strong> ${enlaceApp}
                      </p>

                      <p style="margin:0; word-break:break-all; font-size:12px; line-height:1.6; color:#2563eb;">
                        <strong style="color:#111827;">Web:</strong> ${enlaceWeb}
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:20px 32px 28px 32px; border-top:1px solid #e5e7eb; font-family:Arial, sans-serif;">
                      <p style="margin:0; font-size:12px; line-height:1.6; color:#94a3b8; text-align:center;">
                        VetManage · Este es un correo automático, por favor no respondas a este mensaje.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    });

    this.logger.log(`Correo de restablecimiento enviado a ${to}`);
  }
}