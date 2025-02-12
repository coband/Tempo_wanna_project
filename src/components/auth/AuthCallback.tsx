import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const error = hashParams.get("error");
      const errorDescription = hashParams.get("error_description");

      if (error) {
        console.error("Email confirmation error:", errorDescription);
        navigate("/");
        return;
      }

      // Check if the user is now confirmed
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        navigate("/dashboard");
      } else {
        navigate("/");
      }
    };

    handleEmailConfirmation();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Verifying your email...</h2>
        <p className="text-gray-600">
          Please wait while we confirm your email address.
        </p>
      </div>
    </div>
  );
}
