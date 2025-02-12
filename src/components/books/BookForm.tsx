import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { Book, NewBook } from "@/lib/books";
import { useAuth } from "@/lib/auth";

interface BookFormProps {
  book?: Book;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (book: NewBook) => Promise<void>;
}

export function BookForm({
  book,
  open,
  onOpenChange,
  onSubmit,
}: BookFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<NewBook>({
    defaultValues: book
      ? { ...book }
      : {
          title: "",
          author: "",
          isbn: "",
          subject: "",
          level: "",
          year: new Date().getFullYear(),
          location: "Bibliothek",
          available: true,
        },
  });

  const onSubmitForm = async (data: NewBook) => {
    try {
      setIsLoading(true);
      await onSubmit({ ...data, user_id: user.id });
      toast({
        title: "Success",
        description: `Book ${book ? "updated" : "created"} successfully`,
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Failed to ${book ? "update" : "create"} book`;
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[425px] h-[90vh] sm:h-auto overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {book ? "Buch bearbeiten" : "Buch hinzufügen"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              {...register("title", { required: "Titel ist erforderlich" })}
              placeholder="Buchtitel eingeben"
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Autor</Label>
            <Input
              id="author"
              {...register("author", { required: "Autor ist erforderlich" })}
              placeholder="Autor eingeben"
            />
            {errors.author && (
              <p className="text-sm text-red-500">{errors.author.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="isbn">ISBN</Label>
            <Input
              id="isbn"
              {...register("isbn", {
                required: "ISBN ist erforderlich",
                pattern: {
                  value: /^[0-9-]+$/,
                  message: "ISBN darf nur Zahlen und Bindestriche enthalten",
                },
                validate: (value) =>
                  value.trim().length > 0 || "ISBN darf nicht leer sein",
              })}
              placeholder="ISBN eingeben"
            />
            {errors.isbn && (
              <p className="text-sm text-red-500">{errors.isbn.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Fach</Label>
            <select
              id="subject"
              {...register("subject", { required: "Fach ist erforderlich" })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Fach auswählen...</option>
              <option value="Mathematik">Mathematik</option>
              <option value="Deutsch">Deutsch</option>
              <option value="Französisch">Französisch</option>
              <option value="NMG">NMG</option>
              <option value="Sport">Sport</option>
              <option value="Musik">Musik</option>
              <option value="Englisch">Englisch</option>
              <option value="Bildnerisches Gestalten">
                Bildnerisches Gestalten
              </option>
              <option value="TTG">TTG</option>
              <option value="Divers">Divers</option>
            </select>
            {errors.subject && (
              <p className="text-sm text-red-500">{errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="level">Stufe</Label>
            <select
              id="level"
              {...register("level", { required: "Stufe ist erforderlich" })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Stufe auswählen...</option>
              <option value="KiGa">KiGa</option>
              <option value="Unterstufe">Unterstufe</option>
              <option value="Mittelstufe">Mittelstufe</option>
            </select>
            {errors.level && (
              <p className="text-sm text-red-500">{errors.level.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="year">Erscheinungsjahr</Label>
            <Input
              id="year"
              type="number"
              {...register("year", {
                required: "Erscheinungsjahr ist erforderlich",
                valueAsNumber: true,
              })}
              placeholder="Erscheinungsjahr eingeben"
            />
            {errors.year && (
              <p className="text-sm text-red-500">{errors.year.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Standort</Label>
            <select
              id="location"
              {...register("location", {
                required: "Standort ist erforderlich",
              })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Standort auswählen...</option>
              <option value="Bibliothek">Bibliothek</option>
              <option value="Lehrerzimmer">Lehrerzimmer</option>
              <option value="Klassenzimmer">Klassenzimmer</option>
              <option value="Materialraum">Materialraum</option>
              <option value="Archiv">Archiv</option>
            </select>
            {errors.location && (
              <p className="text-sm text-red-500">{errors.location.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="available">Verfügbarkeit</Label>
            <select
              id="available"
              {...register("available", {
                required: "Verfügbarkeit ist erforderlich",
              })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="true">Verfügbar</option>
              <option value="false">Ausgeliehen</option>
            </select>
            {errors.available && (
              <p className="text-sm text-red-500">{errors.available.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
              )}
              {book ? "Aktualisieren" : "Erstellen"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
