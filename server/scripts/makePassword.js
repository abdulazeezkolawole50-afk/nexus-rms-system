import bcrypt from "bcryptjs";

const pw = process.argv[2] || "password123";
const hash = await bcrypt.hash(pw, 10);

console.log(hash);