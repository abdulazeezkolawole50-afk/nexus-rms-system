import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export async function sendOtpEmail(email, subject, code) {
  await transporter.sendMail({
    from: `"Nexus RMS" <${process.env.SMTP_FROM || SMTP_USER}>`,
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
}