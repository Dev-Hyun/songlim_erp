import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "회원가입",
  description: "This is Next.js SignUp Page SONGLIM Dashboard Template",
  // other metadata
};

export default function SignUp() {
  return <SignUpForm />;
}
