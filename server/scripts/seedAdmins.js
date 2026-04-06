import bcrypt from "bcryptjs";
import { pool } from "../db.js";

async function upsertUser({ email, full_name, password, role }) {
  const hashed = await bcrypt.hash(password, 10);

  // If exists, update password+role. If not, create.
  const [exists] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);

  if (exists.length) {
    await pool.query(
      "UPDATE users SET full_name = ?, hashed_password = ?, role = ? WHERE email = ?",
      [full_name, hashed, role, email]
    );
    console.log(`Updated: ${email} (${role})`);
  } else {
    await pool.query(
      "INSERT INTO users (email, full_name, hashed_password, role) VALUES (?, ?, ?, ?)",
      [email, full_name, hashed, role]
    );
    console.log(`Created: ${email} (${role})`);
  }
}

async function main() {
  await upsertUser({
    email: "admin@test.com",
    full_name: "System Admin",
    password: "admin123",
    role: "admin",
  });

  await upsertUser({
    email: "manager@test.com",
    full_name: "Store Manager",
    password: "manager123",
    role: "manager",
  });

  await pool.end();
  console.log("✅ Done seeding admin/manager.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});