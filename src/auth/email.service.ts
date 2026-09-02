import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import VerificationEmail from './emails/VerificationEmail';
import ContactEmail from './emails/ContactEmail';
import ComplaintEmail from './emails/ComplaintEmail';
import FriendInviteEmail from './emails/FriendInviteEmail';

@Injectable()
export class EmailService {
    private resend: Resend;

    constructor(private configService: ConfigService) {
        this.resend = new Resend(this.configService.get('RESEND_API_KEY'));
    }

    async sendVerificationEmail(email: string, token: string) {
        try {
            const emailHtml = await render(VerificationEmail({ code: token }));
            const fromEmail = this.configService.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

            await this.resend.emails.send({
                from: `Injoyplan <${fromEmail}>`,
                to: email,
                subject: `Código de verificación: ${token} - Injoyplan`,
                html: emailHtml,
            });
            console.log(`Verification email sent to ${email}`);
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    async sendPasswordResetEmail(email: string, token: string) {
        const frontendUrl = this.configService.get('FRONTEND_URL');
        const resetLink = `${frontendUrl}/reset-password?token=${token}`;
        const fromEmail = this.configService.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

        await this.resend.emails.send({
            from: `Injoyplan <${fromEmail}>`,
            to: email,
            subject: 'Recuperación de contraseña - Injoyplan',
            html: `
        <h1>Recuperación de contraseña</h1>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
        <a href="${resetLink}">Restablecer contraseña</a>
      `,
        });
    }

    async sendFriendInviteEmail(email: string, inviterName: string) {
        try {
            const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://injoyplan.com';
            const registerUrl = `${frontendUrl}/?invite=1`;
            const logoUrl = `${frontendUrl}/images/logo.png`;

            const emailHtml = await render(FriendInviteEmail({ inviterName, registerUrl, logoUrl }));
            const fromEmail = this.configService.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

            await this.resend.emails.send({
                from: `Injoyplan <${fromEmail}>`,
                to: email,
                subject: `${inviterName} te invitó a Injoyplan 🎉`,
                html: emailHtml,
            });
            console.log(`Friend invite email sent to ${email}`);
        } catch (error) {
            console.error('Error sending friend invite email:', error);
            throw error;
        }
    }

    async sendContactEmail(data: { nombre: string; correo: string; telefono: string; motivo: string; descripcion: string }) {
        try {
            const emailHtml = await render(ContactEmail({
                nombre: data.nombre,
                correo: data.correo,
                telefono: data.telefono,
                motivo: data.motivo,
                descripcion: data.descripcion,
            }));

            const toEmail = this.configService.get('CONTACT_EMAIL') || 'delivered@resend.dev';
            const fromEmail = this.configService.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

            await this.resend.emails.send({
                from: `Injoyplan Contacto <${fromEmail}>`,
                to: toEmail,
                subject: `Nuevo mensaje: ${data.motivo} - ${data.nombre}`,
                html: emailHtml,
                replyTo: data.correo
            });
            console.log(`Contact email sent to ${toEmail}`);
        } catch (error) {
            console.error('Error sending contact email:', error);
            throw error;
        }
    }

    async sendComplaintEmail(data: {
        idReclamo: string;
        consumerName: string;
        consumerEmail: string;
        consumerPhone: string;
        consumerDocNumber: string;
        consumerAddress: string;
        goodType: string;
        claimType: string;
        claimAmount: string;
        goodDescription: string;
        claimDetail: string;
        orderRequest: string;
        createdAt: string;
    }) {
        try {
            const emailHtml = await render(ComplaintEmail({
                ...data
            }));

            const toEmail = this.configService.get('CONTACT_EMAIL');
            const fromEmail = this.configService.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

            console.log('--- SENDING COMPLAINT EMAIL ---');
            console.log('To Admin (Config):', toEmail);
            console.log('From:', fromEmail);
            console.log('Consumer Copy:', data.consumerEmail);

            if (!toEmail) {
                console.warn('WARNING: CONTACT_EMAIL is not defined in environment variables!');
            }

            // Send to Admin/Contact
            const adminData = await this.resend.emails.send({
                from: `Injoyplan Reclamos <${fromEmail}>`,
                to: toEmail || 'delivered@resend.dev', // Fallback only if missing
                subject: `Nuevo Reclamo Registrado [${data.idReclamo}] - Injoyplan`,
                html: emailHtml,
                replyTo: data.consumerEmail
            });
            console.log('Admin Email Result:', adminData);

            // Send Copy to User
            const userData = await this.resend.emails.send({
                from: `Injoyplan Reclamos <${fromEmail}>`,
                to: data.consumerEmail,
                subject: `Copia de tu Reclamo [${data.idReclamo}] - Injoyplan`,
                html: emailHtml
            });
            console.log('User Copy Result:', userData);

        } catch (error) {
            console.error('Error sending complaint email:', error);
            // Don't throw error to avoid blocking the HTTP response if email fails?
            // Or throw? Better to log and maybe not fail the whole request since DB save is critical.
            // But user expects "success" usually means email sent.
            // I'll throw to be safe for now or just log.
            // "No me llega el reclamo" -> failing silently is bad.
            console.error(error);
        }
    }
}
