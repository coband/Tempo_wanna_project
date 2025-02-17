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
import { fetchBookInfo } from "@/lib/api";

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
  book: initialBook,
  open,
  onOpenChange,
  onSubmit,
}: BookFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isLoadingBookInfo, setIsLoadingBookInfo] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    setValue,
    getValues,
  } = useForm<NewBook>({
    defaultValues: initialBook
      ? { ...initialBook }
      : {
          title: "",
          author: "",
          isbn: "",
          subject: "",
          level: "",
          year: new Date().getFullYear(),
          location: "Bibliothek",
          available: true,
          description: "",
        },
  });

  const onSubmitForm = async (data: NewBook) => {
    try {
      setIsLoading(true);
      await onSubmit({ ...data, user_id: user.id });
      toast({
        title: "Success",
        description: `Book ${initialBook ? "updated" : "created"} successfully`,
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Failed to ${initialBook ? "update" : "create"} book`;
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async (isbn: string) => {
    setIsLoadingBookInfo(true);
    try {
      console.log("Fetching book info for ISBN:", isbn);
      const bookInfo = await fetchBookInfo(isbn);
      console.log("Received book info:", bookInfo);
      setValue("isbn", bookInfo.isbn);
      setValue("title", bookInfo.title);
      setValue("author", bookInfo.author);
      setValue("subject", bookInfo.subject);
      setValue("level", bookInfo.level);
      setValue("year", bookInfo.year);
      setValue("location", bookInfo.location);
      setValue("description", bookInfo.description);
      toast({
        title: "Buchinformationen geladen",
        description:
          "Bitte überprüfen Sie die Daten und passen Sie sie bei Bedarf an.",
      });
    } catch (error) {
      console.error("Error fetching book info:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description:
          "Buchinformationen konnten nicht geladen werden. Bitte geben Sie die Informationen manuell ein.",
      });
      setValue("isbn", isbn);
    } finally {
      setIsLoadingBookInfo(false);
      setShowScanner(false);
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
                disabled={isLoadingBookInfo}
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleScan(getValues("isbn"))}
                disabled={isLoadingBookInfo}
              >
                Suchen
              </Button>
            </div>
            {isLoadingBookInfo && (
              <div className="text-sm text-muted-foreground">
                Lade Buchinformationen...
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Fach</Label>
            <Controller
              name="subject"
              control={control}
              rules={{ required: "Fach ist erforderlich" }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
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
                <Select onValueChange={field.onChange} value={field.value}>
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
            <Label htmlFor="description">Beschreibung</Label>
            <textarea
              id="description"
              {...register("description")}
              placeholder="Beschreibung eingeben"
              className="w-full min-h-[100px] p-2 border rounded-md"
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
              {initialBook ? "Aktualisieren" : "Erstellen"}
            </Button>
          </div>
        </form>
      </DialogContent>

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        {showScanner && (
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        )}
      </Dialog>
    </Dialog>
  );
}
