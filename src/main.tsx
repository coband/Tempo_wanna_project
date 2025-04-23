import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "./components/ui/toaster";
import { ClerkProvider } from "@clerk/clerk-react";
import { SupabaseProvider } from "./contexts/SupabaseContext";

// Import and initialize Tempo Devtools
import { TempoDevtools } from "tempo-devtools";
TempoDevtools.init();

const basename = import.meta.env.BASE_URL;
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error("Missing Clerk Publishable Key");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPubKey}>
      <SupabaseProvider>
        <BrowserRouter basename={basename}>
          <App />
          <Toaster />
        </BrowserRouter>
      </SupabaseProvider>
    </ClerkProvider>
  </React.StrictMode>,
);
