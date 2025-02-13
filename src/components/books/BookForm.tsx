import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Camera } from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

const LEVELS = ["KiGa", "Unterstufe", "Mittelstufe", "Oberstufe"];
const SUBJECTS = [
  "Mathematik",
  "Deutsch",
  "NMG",
  "Englisch",
  "Französisch",
  "Bildnerisches Gestalten",
  "Musik",
  "Sport",
  "TTG",
  "Divers",
];

export function BookForm({
  book,
  open,
  onOpenChange,
  onSubmit,
}: BookFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    setValue,
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
      <DialogContent className="sm:max-w-[425px] h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Buch hinzufügen
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Füllen Sie die folgenden Felder aus, um ein neues Buch hinzuzufügen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              {...register("title", { required: "Titel ist erforderlich" })}
              placeholder="Buchtitel eingeben"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Autor</Label>
            <Input
              id="author"
              {...register("author", { required: "Autor ist erforderlich" })}
              placeholder="Autor eingeben"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="isbn">ISBN</Label>
            <div className="flex gap-2">
              <Input
                id="isbn"
                {...register("isbn", { required: "ISBN ist erforderlich" })}
                placeholder="ISBN eingeben"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Fach</Label>
            <Controller
              name="subject"
              control={control}
              rules={{ required: "Fach ist erforderlich" }}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Fach auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="level">Stufe</Label>
            <Controller
              name="level"
              control={control}
              rules={{ required: "Stufe ist erforderlich" }}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Stufe auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Ort</Label>
            <Input
              id="location"
              {...register("location", { required: "Ort ist erforderlich" })}
              placeholder="Ort eingeben"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="year">Erscheinungsjahr</Label>
            <Input
              id="year"
              type="number"
              {...register("year", {
                required: "Erscheinungsjahr ist erforderlich",
                valueAsNumber: true,
                min: {
                  value: 1800,
                  message: "Jahr muss nach 1800 sein",
                },
                max: {
                  value: new Date().getFullYear(),
                  message: "Jahr kann nicht in der Zukunft liegen",
                },
              })}
              placeholder="Jahr eingeben"
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
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

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        {showScanner && (
          <BarcodeScanner
            onScan={(isbn) => {
              setValue("isbn", isbn);
              setShowScanner(false);
            }}
            onClose={() => setShowScanner(false)}
          />
        )}
      </Dialog>
    </Dialog>
  );
}
