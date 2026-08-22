"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearMizanStorage } from "@/lib/entity-context";

export function ProfileSignOutClerk() {
  return (
    <SignOutButton signOutOptions={{ redirectUrl: "/sign-in" }}>
      <Button
        type="button"
        variant="destructive"
        className="mt-3 gap-2"
        onClick={() => clearMizanStorage()}
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </SignOutButton>
  );
}
