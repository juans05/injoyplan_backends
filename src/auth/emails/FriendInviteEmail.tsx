import * as React from 'react';
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
    Hr,
    Row,
    Column,
} from '@react-email/components';

interface FriendInviteEmailProps {
    inviterName: string;
    registerUrl: string;
    logoUrl: string;
}

export const FriendInviteEmail = ({ inviterName, registerUrl, logoUrl }: FriendInviteEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>{inviterName} te invitó a descubrir los mejores planes en Injoyplan</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={box}>
                        <Section style={logoContainer}>
                            <Img src={logoUrl} width="120" height="auto" alt="Injoyplan" style={logo} />
                        </Section>

                        <Heading style={heading}>¡{inviterName} te invitó a Injoyplan! 🎉</Heading>
                        <Text style={paragraph}>
                            Injoyplan es la plataforma donde miles de personas descubren conciertos, obras de teatro,
                            ferias y planes únicos cerca de ellos, y los comparten con sus amigos. <strong>{inviterName}</strong> ya
                            está aquí y quiere tenerte cerca para planear juntos su próxima salida.
                        </Text>

                        <Section style={benefitsBox}>
                            <Row>
                                <Column style={benefitIcon}>🔎</Column>
                                <Column>
                                    <Text style={benefitText}>Descubre eventos cerca de ti, filtrados por tus gustos</Text>
                                </Column>
                            </Row>
                            <Row>
                                <Column style={benefitIcon}>👥</Column>
                                <Column>
                                    <Text style={benefitText}>Conecta con amigos y mira qué planes eligen</Text>
                                </Column>
                            </Row>
                            <Row>
                                <Column style={benefitIcon}>🎟️</Column>
                                <Column>
                                    <Text style={benefitText}>Guarda tus favoritos y no te pierdas ninguna fecha</Text>
                                </Column>
                            </Row>
                        </Section>

                        <Section style={{ textAlign: 'center' as const, marginTop: '8px', marginBottom: '32px' }}>
                            <Button style={button} href={registerUrl}>
                                Unirme a Injoyplan
                            </Button>
                        </Section>

                        <Text style={smallPrint}>
                            Es gratis y toma menos de un minuto. Si el botón no funciona, copia y pega este enlace en tu navegador:
                            <br />
                            <Link href={registerUrl} style={anchor}>{registerUrl}</Link>
                        </Text>

                        <Hr style={hr} />

                        <Text style={footer}>
                            &copy; {new Date().getFullYear()} Injoyplan. Todos los derechos reservados.
                            <br />
                            Recibiste este correo porque {inviterName} te invitó a unirte a Injoyplan.
                            <br />
                            <Link href="https://injoyplan.com" style={anchor}>www.injoyplan.com</Link>
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
};

export default FriendInviteEmail;

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '40px 0',
    marginBottom: '64px',
};

const box = {
    padding: '0 48px',
};

const logoContainer = {
    marginBottom: '32px',
    textAlign: 'center' as const,
};

const logo = {
    margin: '0 auto',
};

const heading = {
    fontSize: '26px',
    letterSpacing: '-0.5px',
    lineHeight: '1.3',
    fontWeight: '800',
    color: '#212121',
    marginTop: '0',
    marginBottom: '20px',
    textAlign: 'center' as const,
};

const paragraph = {
    fontSize: '16px',
    lineHeight: '26px',
    color: '#666666',
    marginBottom: '28px',
    textAlign: 'center' as const,
};

const benefitsBox = {
    backgroundColor: '#F0F8FA',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '32px',
    border: '1px solid #E1E8ED',
};

const benefitIcon = {
    width: '32px',
    fontSize: '20px',
    verticalAlign: 'top' as const,
};

const benefitText = {
    fontSize: '14px',
    lineHeight: '22px',
    color: '#333333',
    margin: '4px 0',
};

const button = {
    backgroundColor: '#007FA4',
    borderRadius: '999px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '14px 40px',
};

const smallPrint = {
    fontSize: '13px',
    lineHeight: '20px',
    color: '#999999',
    textAlign: 'center' as const,
    marginBottom: '8px',
    wordBreak: 'break-all' as const,
};

const hr = {
    borderColor: '#e6ebf1',
    margin: '32px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    lineHeight: '16px',
    textAlign: 'center' as const,
};

const anchor = {
    color: '#007FA4',
    textDecoration: 'none',
};
