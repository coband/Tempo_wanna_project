import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
import { BookOpen, BookText, Search, MessageSquare, Settings, Shield, BookMarked, Users } from "lucide-react";
import { useEffect } from "react";

export function Hero() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  
  // Wenn der Benutzer angemeldet ist, direkt zum Dashboard weiterleiten
  useEffect(() => {
    if (isSignedIn) {
      navigate("/dashboard");
    }
  }, [isSignedIn, navigate]);
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Navigation */}
          <nav className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <BookMarked className="h-8 w-8 mr-2" />
              <span className="text-2xl font-bold">Wanna</span>
            </div>
            <SignedOut>
              <div className="flex gap-4">
                <Button
                  asChild
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                >
                  <Link to="/sign-in">Anmelden</Link>
                </Button>
                <Button
                  asChild
                  className="bg-white text-purple-600 hover:bg-purple-50"
                >
                  <Link to="/sign-up">Registrieren</Link>
                </Button>
              </div>
            </SignedOut>
            <SignedIn>
              <div className="flex items-center gap-4">
                <Button
                  asChild
                  className="bg-white text-purple-600 hover:bg-purple-50"
                >
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <UserButton afterSignOutUrl="/" />
              </div>
            </SignedIn>
          </nav>
          
          {/* Hero Content */}
          <div className="py-16 sm:py-24 lg:py-32 flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/2 space-y-8 text-center lg:text-left">
              <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl">
                Deine digitale Schulbibliothek
              </h1>
              <p className="text-xl text-purple-100 max-w-2xl">
                Wanna macht die Verwaltung deiner Schulbibliothek einfach und effizient. Finde, leihe und verwalte Bücher mit wenigen Klicks.
              </p>
              <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                <SignedOut>
                  <Button
                    size="lg"
                    asChild
                    className="bg-white text-purple-600 hover:bg-purple-50"
                  >
                    <Link to="/sign-in">Jetzt starten</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="bg-transparent text-white border-white hover:bg-white/10"
                  >
                    <Link to="/sign-up">Konto erstellen</Link>
                  </Button>
                </SignedOut>
                <SignedIn>
                  <Button size="lg" asChild className="bg-white text-purple-600 hover:bg-purple-50">
                    <Link to="/dashboard">Zum Dashboard</Link>
                  </Button>
                  <Button size="lg" asChild variant="outline" className="bg-transparent text-white border-white hover:bg-white/10">
                    <Link to="/books">Bücher durchsuchen</Link>
                  </Button>
                </SignedIn>
              </div>
            </div>
            <div className="lg:w-1/2 relative hidden lg:block">
              <div className="absolute -top-4 -left-4 w-72 h-72 bg-pink-500 rounded-lg opacity-20 blur-2xl"></div>
              <div className="absolute -bottom-8 -right-8 w-72 h-72 bg-purple-700 rounded-lg opacity-20 blur-2xl"></div>
              <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 shadow-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 p-4 rounded-lg">
                    <BookOpen className="text-white h-8 w-8 mb-2" />
                    <h3 className="font-semibold text-white">Große Auswahl</h3>
                    <p className="text-purple-100 text-sm">an Büchern und Lehrmitteln</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-lg">
                    <Users className="text-white h-8 w-8 mb-2" />
                    <h3 className="font-semibold text-white">Wachsende Community</h3>
                    <p className="text-purple-100 text-sm">von Nutzern</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-lg">
                    <MessageSquare className="text-white h-8 w-8 mb-2" />
                    <h3 className="font-semibold text-white">KI-Assistent</h3>
                    <p className="text-purple-100 text-sm">Für PDFs</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-lg">
                    <Search className="text-white h-8 w-8 mb-2" />
                    <h3 className="font-semibold text-white">Schnelle Suche</h3>
                    <p className="text-purple-100 text-sm">Einfach finden</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Alles was du für deine Schulbibliothek brauchst
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Wanna bietet alle Tools, die du benötigst, um deine Schulbibliothek effizient zu verwalten
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
              <BookOpen className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Digitaler Katalog
              </h3>
              <p className="text-gray-600">
                Verwalte deinen gesamten Buchbestand digital. Erfasse alle wichtigen Informationen wie Autor, ISBN, Verfügbarkeit und mehr.
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
              <MessageSquare className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                PDF Chat
              </h3>
              <p className="text-gray-600">
                Interagiere mit dem Inhalt deiner PDFs mithilfe unseres KI-Assistenten. Stelle Fragen und erhalte sofort Antworten.
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
              <Search className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Intelligente Suche
              </h3>
              <p className="text-gray-600">
                Finde schnell das richtige Buch mit unserer leistungsstarken Suchfunktion. Durchsuche Titel, Autoren, Verlage und mehr.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
              <BookText className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Ausleihverwaltung
              </h3>
              <p className="text-gray-600">
                Verfolge, wer welche Bücher ausgeliehen hat. Einfache Ausleihe und Rückgabe mit nur einem Klick.
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
              <Settings className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Einfache Bedienung
              </h3>
              <p className="text-gray-600">
                Intuitive Benutzeroberfläche, die keine technischen Vorkenntnisse erfordert. Sofort einsatzbereit.
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6 shadow-sm">
              <Shield className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Sicherheit
              </h3>
              <p className="text-gray-600">
                Sichere Authentifizierung und Datenschutz. Deine Bücherdaten sind bei uns in guten Händen.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-purple-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl mb-6">
            Bereit, deine Schulbibliothek zu digitalisieren?
          </h2>
          <p className="text-purple-100 text-lg max-w-2xl mx-auto mb-8">
            Starte noch heute und mache deine Bibliotheksverwaltung einfacher denn je.
          </p>
          <SignedOut>
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="bg-white text-purple-600 hover:bg-purple-50"
              >
                <Link to="/sign-in">Jetzt anmelden</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="bg-transparent text-white border-white hover:bg-white/10"
              >
                <Link to="/sign-up">Konto erstellen</Link>
              </Button>
            </div>
          </SignedOut>
          <SignedIn>
            <Button size="lg" asChild className="bg-white text-purple-600 hover:bg-purple-50">
              <Link to="/dashboard">Zum Dashboard</Link>
            </Button>
          </SignedIn>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <BookMarked className="h-6 w-6 mr-2" />
              <span className="text-white font-bold">Wanna</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span>© 2023 Wanna</span>
              <span>·</span>
              <a href="#" className="hover:text-white">Datenschutz</a>
              <span>·</span>
              <a href="#" className="hover:text-white">Nutzungsbedingungen</a>
              <span>·</span>
              <a href="#" className="hover:text-white">Kontakt</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
