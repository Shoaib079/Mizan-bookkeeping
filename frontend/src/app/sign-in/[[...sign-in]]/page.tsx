import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

import { SignInReasonBanner } from "@/components/auth/sign-in-reason-banner";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <Suspense fallback={null}>
        <SignInReasonBanner />
      </Suspense>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  );
}
