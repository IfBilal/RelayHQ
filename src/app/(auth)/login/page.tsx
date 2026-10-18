import { AuthForm } from "@/features/identity/components/auth-form";

export const metadata = { title: "Sign in · RelayHQ" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
