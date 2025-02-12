import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "../auth/AuthDialog";

export function Hero() {
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-center px-4 py-8 text-white">
      <div className="max-w-3xl text-center space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
          Welcome to Wanna
        </h1>
        <p className="text-xl text-purple-100">
          Deine digitale Schulbibliothek.
        </p>
        <div className="flex justify-center gap-4">
          <Button
            size="lg"
            onClick={() => setShowAuthDialog(true)}
            className="bg-white text-purple-600 hover:bg-purple-50"
          >
            Get Started
          </Button>
        </div>
      </div>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </div>
  );
}
