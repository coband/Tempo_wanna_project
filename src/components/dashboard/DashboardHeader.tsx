import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

export function DashboardHeader() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="border-b bg-white">
      <div className="flex h-16 items-center px-4 max-w-7xl mx-auto justify-between">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
          BookCatalog
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-gray-600 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
