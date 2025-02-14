import { supabase } from "./supabase";

export async function fetchBookInfo(isbn: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error("No access token available");
    }

    const response = await fetch(`${supabase.functions.url}/book-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ isbn }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data) {
      throw new Error("No data returned from function");
    }

    if (!data) {
      throw new Error("No data returned from function");
    }

    return {
      title: data.Titel,
      author: data.Autor,
      isbn: data.ISBN,
      level: data.Stufe,
      subject: data.Fach,
      year: parseInt(data.Erscheinungsjahr),
      location: "Bibliothek", // Default value
      available: true, // Default value
    };
  } catch (error) {
    console.error("Error fetching book info:", error);
    throw error;
  }
}
