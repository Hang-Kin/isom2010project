import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { EventNotice } from "@/components/EventNotice"; // FEAT-7

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <>
      <AuthForm mode="signup" />
      <div className="mx-auto mt-6 max-w-md">
        <EventNotice /> {/* FEAT-7 */}
      </div>
    </>
  );
}
