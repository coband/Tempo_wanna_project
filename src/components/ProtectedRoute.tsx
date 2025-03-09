import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
