import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

export async function compareCode(code, hash) {
  return bcrypt.compare(code, hash);
}

export function signJwt(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    },
    process.env.JWT_SECRET || "nexus_secret_key",
    { expiresIn: "2h" }
  );
}