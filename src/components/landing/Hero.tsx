import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

export function Hero() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-center px-4 py-8 text-white">
      <div className="max-w-3xl text-center space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
          Welcome to Wanna
        </h1>
        <p className="text-xl text-purple-100">
          Deine digitale Schulbibliothek.
        </p>
        
        <SignedOut>
          <div className="flex justify-center gap-4">
            <Button
              size="lg"
              asChild
              className="bg-white text-purple-600 hover:bg-purple-50"
            >
              <Link to="/sign-in">Anmelden</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="bg-transparent text-white border-white hover:bg-white/10"
            >
              <Link to="/sign-up">Registrieren</Link>
            </Button>
          </div>
        </SignedOut>
        
        <SignedIn>
          <div className="flex flex-col items-center gap-4">
            <Button size="lg" asChild className="bg-white text-purple-600 hover:bg-purple-50">
              <Link to="/dashboard">Zum Dashboard</Link>
            </Button>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-white">Angemeldet als:</span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </SignedIn>
      </div>
    </div>
  );
}
