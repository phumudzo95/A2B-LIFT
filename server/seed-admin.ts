import bcrypt from "bcryptjs";
import { storage } from "./storage";

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const name = process.env.ADMIN_NAME || "Admin";

  const existing = await storage.getUserByUsername(username);
  if (existing) {
    console.log(`Admin user already exists: ${username}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await storage.createUser({
    username,
    password: hashedPassword,
    name,
    phone: null,
    role: "admin",
  });

  console.log("Created admin user:", { id: user.id, username: user.username });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

