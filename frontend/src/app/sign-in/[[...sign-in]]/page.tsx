import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

import { SignInReasonBanner } from "@/components/auth/sign-in-reason-banner";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <Suspense fallback={null}>
        <SignInReasonBanner />
      </Suspense>
      {/* fallbackRedirectUrl, not forceRedirectUrl.
       *
       * Without either, Clerk has nowhere to send you after sign-in and falls
       * back to the Home URL configured in the Clerk dashboard — which, when
       * unset, is Clerk's own "now connect Clerk to your application"
       * placeholder. Signing in appears to work and then strands you.
       *
       * "fallback" is the right one because the middleware appends a
       * redirect_url when it intercepts a protected page. That should win, so
       * someone deep-linked to a report lands on the report, not the
       * dashboard. This is only the answer when nothing else asked. */}
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}
