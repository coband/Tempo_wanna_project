import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1),
        );
        const error = hashParams.get("error");
        const errorDescription = hashParams.get("error_description");

        if (error) {
          console.error("Email confirmation error:", errorDescription);
          setStatus("error");
          setErrorMessage(errorDescription || "Ein Fehler ist aufgetreten");
          return;
        }

        // Check if the user is now confirmed
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          setStatus("success");
          // Redirect after 3 seconds
          setTimeout(() => navigate("/dashboard"), 3000);
        } else {
          setStatus("error");
          setErrorMessage("Sitzung konnte nicht erstellt werden");
        }
      } catch (error) {
        console.error("Auth callback error:", error);
        setStatus("error");
        setErrorMessage("Ein unerwarteter Fehler ist aufgetreten");
      }
    };

    handleEmailConfirmation();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center space-y-6">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto" />
            <h2 className="text-2xl font-semibold">E-Mail wird bestätigt...</h2>
            <p className="text-gray-600">
              Bitte warten Sie, während wir Ihre E-Mail-Adresse verifizieren.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-2xl font-semibold text-green-500">
              E-Mail erfolgreich bestätigt!
            </h2>
            <p className="text-gray-600">
              Ihre E-Mail-Adresse wurde erfolgreich verifiziert. Sie werden in
              wenigen Sekunden weitergeleitet...
            </p>
            <Button onClick={() => navigate("/dashboard")} className="mt-4">
              Zum Dashboard
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-2xl font-semibold text-red-500">
              Bestätigung fehlgeschlagen
            </h2>
            <p className="text-gray-600">{errorMessage}</p>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="mt-4"
            >
              Zurück zur Startseite
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
