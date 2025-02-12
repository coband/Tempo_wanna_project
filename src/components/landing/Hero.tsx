import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

export function Hero() {
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // If user is already logged in, redirect to dashboard
  if (user) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-500/20" />

      {/* Floating elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center space-y-8 px-4">
        <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
          Welcome to BookCatalog
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto">
          Your digital library management system. Search, filter, and organize
          your books with ease.
        </p>
        <div className="flex gap-4 justify-center">
          <Button
            size="lg"
            onClick={() => setShowAuthDialog(true)}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setShowAuthDialog(true)}
          >
            Sign In
          </Button>
        </div>

        <div className="pt-8">
          <p className="text-sm text-gray-500">
            Trusted by libraries worldwide
          </p>
          <div className="flex justify-center gap-8 mt-4 grayscale opacity-50">
            {/* Add your library partner logos here */}
          </div>
        </div>
      </div>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </div>
  );
}
