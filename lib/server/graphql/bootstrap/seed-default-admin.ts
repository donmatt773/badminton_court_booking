import { hash } from "bcryptjs";
import { UserModel } from "@/lib/server/graphql/models/User";

export async function seedDefaultAdmin(): Promise<void> {
  const existingAdmin = await UserModel.findOne({ username: "admin" });

  if (existingAdmin) {
    return;
  }

  const passwordHash = await hash("admin", 10);

  await UserModel.create({
    username: "admin",
    name: "admin",
    email: "admin@local.dev",
    role: "ADMIN",
    isActive: true,
    passwordHash,
  });
}
