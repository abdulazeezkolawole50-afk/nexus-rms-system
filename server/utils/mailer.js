import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "no-reply@nexus-rms.com";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("MAILER WARNING: SMTP credentials are missing.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    family: 4,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
}

export async function sendOtpEmail(email, subject, code) {
  try {
    const mailer = getTransporter();

    if (!mailer) {
      return {
        sent: false,
        reason: "SMTP_NOT_CONFIGURED",
      };
    }

    await mailer.sendMail({
      from: `"Nexus RMS" <${SMTP_FROM}>`,
      to: email,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Nexus RMS Verification Code</h2>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing:4px">${code}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
    });

    return { sent: true };
  } catch (error) {
    console.error("MAILER ERROR:", error);
    return {
      sent: false,
      reason: error?.code || "MAIL_SEND_FAILED",
      error: error?.message || "Unknown mail error",
    };
  }
}