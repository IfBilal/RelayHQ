import { AuthForm } from "@/features/identity/components/auth-form";

export const metadata = { title: "Create workspace · RelayHQ" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
