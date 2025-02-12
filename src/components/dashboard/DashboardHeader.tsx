import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

interface DashboardHeaderProps {
  className?: string;
}

export function DashboardHeader({ className = "" }: DashboardHeaderProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <header className={`border-b bg-white ${className}`}>
      <div className="flex h-16 items-center px-4 max-w-7xl mx-auto justify-between">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
          Wanna
        </h2>
        <button
          type="button"
          onTouchEnd={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
          onClick={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
          className="flex items-center justify-center px-3 py-2 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors min-h-[44px] min-w-[44px] touch-manipulation cursor-pointer select-none"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <LogOut className="h-5 w-5 sm:mr-2" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
