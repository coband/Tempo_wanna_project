import { useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { Camera, ChevronDown } from "lucide-react";
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
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { fetchBookInfo } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import React from "react";
import { LEVELS, SUBJECTS, BOOK_TYPES, SCHOOLS } from "@/lib/constants";

interface BookFormProps {
  book?: Book;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (book: NewBook) => Promise<void>;
}

export function BookForm({
  book: initialBook,
  open,
  onOpenChange,
  onSubmit,
}: BookFormProps) {
  const [book, setBook] = useState<Book | null>(initialBook || null);
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isLoadingBookInfo, setIsLoadingBookInfo] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const clerkAuth = useClerkAuth();

  const { register, handleSubmit, control, reset, setValue, getValues, formState } =
    useForm<NewBook>({
      mode: "onChange"
    });
  
  // Referenz für die Dialog-Inhalts-Komponente
  const dialogContentRef = React.useRef<HTMLDivElement>(null);
  
  // Funktion zum Fokussieren des Dialogs, um Schärfe zu erhalten
  const ensureDialogSharpness = () => {
    // Dialog neu fokussieren und Rendering erzwingen
    if (dialogContentRef.current) {
      dialogContentRef.current.style.transform = 'translateZ(0)';
      // Ein minimaler Timeout, um das Rendering zu erzwingen
      setTimeout(() => {
        if (dialogContentRef.current) {
          dialogContentRef.current.style.transform = '';
        }
      }, 0);
    }
  };

  // Formular zurücksetzen, wenn der Dialog geöffnet/geschlossen wird
  useEffect(() => {
    if (open) {
      // Nur wenn der Dialog geöffnet wird
      if (initialBook) {
        const formValues = {
          title: initialBook.title,
          author: initialBook.author,
          isbn: initialBook.isbn,
          subject: initialBook.subject,
          level: initialBook.level,
          year: initialBook.year,
          location: initialBook.location,
          available: initialBook.available,
          description: initialBook.description || "",
          school: initialBook.school || "Chriesiweg",
          type: initialBook.type,
          publisher: initialBook.publisher || "",
        };
        
        reset(formValues);
        
        // Explizit die Subject- und Type-Felder aktualisieren
        setTimeout(() => {
          setValue("subject", initialBook.subject, { shouldValidate: true });
          setValue("type", initialBook.type, { shouldValidate: true });
        }, 100);
      } else {
        reset({
          title: "",
          author: "",
          isbn: "",
          subject: "",
          level: "",
          year: new Date().getFullYear(),
          location: "Bibliothek",
          available: true,
          description: "",
          school: "Chriesiweg",
          type: "Lesebuch",
          publisher: "",
        });
      }
      
      // Fokus setzen nach dem Zurücksetzen des Formulars
      setTimeout(ensureDialogSharpness, 50);
    }
  }, [initialBook, reset, open, setValue]);

  // Funktion zum Abbrechen und Zurücksetzen
  const handleCancel = () => {
    reset({
      title: "",
      author: "",
      isbn: "",
      subject: "",
      level: "",
      year: new Date().getFullYear(),
      location: "Bibliothek",
      available: true,
      description: "",
      school: "Chriesiweg",
      type: "Lesebuch",
      publisher: "",
    });
    onOpenChange(false);
  };

  const onSubmitForm = async (data: NewBook) => {
    try {
      setIsLoading(true);
      if (initialBook) {
        await onSubmit({ ...data, user_id: user.id, id: initialBook.id });
      } else {
        await onSubmit({ ...data, user_id: user.id });
      }
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

  // Dynamische Buchlisten für bessere Kompatibilität mit API-Werten
  const availableBookTypes = useMemo(() => {
    // Standardtypen aus der Konstante
    const types = [...BOOK_TYPES];
    
    // Wenn ein Buch-Typ aus API nicht in der Liste ist, fügen wir ihn hinzu
    if (initialBook?.type && !types.includes(initialBook.type)) {
      types.push(initialBook.type);
    }
    
    return types;
  }, [initialBook?.type]);
  
  // Dynamische Fächer-Liste
  const availableSubjects = useMemo(() => {
    // Standardfächer aus der Konstante
    const subjects = [...SUBJECTS];
    
    // Wenn ein Fach aus API nicht in der Liste ist, fügen wir es hinzu
    if (initialBook?.subject && !subjects.includes(initialBook.subject)) {
      subjects.push(initialBook.subject);
    }
    
    return subjects;
  }, [initialBook?.subject]);

  // Hilfsfunktion zum forcieren der Formularaktualisierung
  const updateFormFields = (bookInfo: any) => {
    // Für Buchtyp: Nur "Lehrmittel" mit "Lesebuch" ersetzen, sonst den Original-Wert verwenden
    const bookType = bookInfo.type === "Lehrmittel" 
      ? "Lesebuch" 
      : (bookInfo.type || "");
    
    // Temporär zuweisen zur weiteren Verwendung 
    const tmpSubject = bookInfo.subject || "";
    const tmpType = bookType;
    
    // Wenn der Typ oder das Fach nicht in der verfügbaren Liste ist, aktualisieren wir die Listen
    if (tmpType && !availableBookTypes.includes(tmpType)) {
      availableBookTypes.push(tmpType);
    }
    
    if (tmpSubject && !availableSubjects.includes(tmpSubject)) {
      availableSubjects.push(tmpSubject);
    }
    
    // Werte setzen
    setValue("isbn", bookInfo.isbn || "");
    setValue("title", bookInfo.title || "");
    setValue("author", bookInfo.author || "");
    setValue("subject", tmpSubject);
    setValue("level", bookInfo.level || "");
    setValue("year", bookInfo.year || new Date().getFullYear());
    setValue("location", bookInfo.location || "Bibliothek");
    setValue("description", bookInfo.description || "");
    setValue("type", tmpType);
    setValue("school", bookInfo.school || "Chriesiweg");
    setValue("publisher", bookInfo.publisher || "");
    
    // Manuelle Aktualisierung erzwingen
    ["subject", "type"].forEach(fieldName => {
      setValue(fieldName as any, getValues(fieldName as any), { 
        shouldDirty: true, 
        shouldTouch: true,
        shouldValidate: true 
      });
    });
    
    // Fokus setzen
    setTimeout(ensureDialogSharpness, 50);
  };

  const handleScan = async (isbn: string) => {
    setIsLoadingBookInfo(true);
    try {
      // Hole Clerk-Token für Supabase
      let authToken = null;
      try {
        authToken = await clerkAuth.getToken({ template: 'supabase' });
      } catch (tokenError) {
        console.warn("Fehler beim Abrufen des Auth-Tokens:", tokenError);
        // Wir fahren trotzdem fort, fetchBookInfo wird dann den anon key verwenden
      }
      
      const bookInfo = await fetchBookInfo(isbn, authToken);
      
      // Aktualisiere die verfügbaren Listen, bevor das Formular aktualisiert wird
      if (bookInfo.type && !availableBookTypes.includes(bookInfo.type)) {
        // Da availableBookTypes ein useMemo ist, müssen wir die Liste manuell erweitern
        const newType = bookInfo.type === "Lehrmittel" ? "Lesebuch" : bookInfo.type;
        if (!availableBookTypes.includes(newType)) {
          availableBookTypes.push(newType);
        }
      }
      
      if (bookInfo.subject && !availableSubjects.includes(bookInfo.subject)) {
        availableSubjects.push(bookInfo.subject);
      }
      
      // Formularfelder mit den erhaltenen Daten aktualisieren
      updateFormFields(bookInfo);
      
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
      
      // Nach dem Schließen des Scanners Fokus setzen
      setTimeout(ensureDialogSharpness, 50);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        // Wenn Dialog geschlossen wird: Formular zurücksetzen
        reset();
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent 
        ref={dialogContentRef}
        className="sm:max-w-[425px] h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialBook ? "Buch bearbeiten" : "Buch hinzufügen"}
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {initialBook
              ? "Bearbeiten Sie die Buchinformationen."
              : "Füllen Sie die folgenden Felder aus, um ein neues Buch hinzuzufügen."}
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
                    {availableSubjects.map((subject) => (
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
              render={({ field }) => {
                const fieldValue = field.value ? String(field.value) : '';
                const selectedLevels = fieldValue ? fieldValue.split(', ').filter(Boolean) : [];
                
                const toggleLevel = (level: string) => {
                  const isSelected = selectedLevels.includes(level);
                  let newSelected;
                  
                  if (isSelected) {
                    newSelected = selectedLevels.filter(l => l !== level);
                  } else {
                    // Wenn eine neue Stufe ausgewählt wird und "Unbekannt" im Array ist,
                    // entferne "Unbekannt" aus der Auswahl
                    let levelsWithoutUnknown = selectedLevels.filter(l => l !== "Unbekannt");
                    newSelected = [...levelsWithoutUnknown, level];
                  }
                  
                  field.onChange(newSelected.join(', '));
                };
                
                const displayText = selectedLevels.length > 0 
                  ? selectedLevels.join(', ') 
                  : "Stufen auswählen";
                
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        role="combobox" 
                        aria-expanded={false}
                        className="w-full justify-between"
                      >
                        <span className="truncate">{displayText}</span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                      <div className="p-2">
                        <div className="grid gap-2">
                          {LEVELS.map((level) => (
                            <div className="flex items-center space-x-2" key={level}>
                              <Checkbox 
                                id={`level-${level}`}
                                checked={selectedLevels.includes(level)}
                                onCheckedChange={() => toggleLevel(level)}
                              />
                              <label 
                                htmlFor={`level-${level}`}
                                className="text-sm cursor-pointer w-full"
                              >
                                {level}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Buchtyp</Label>
            <Controller
              name="type"
              control={control}
              rules={{ required: "Buchtyp ist erforderlich" }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Buchtyp auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBookTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="publisher">Verlag</Label>
            <Input
              id="publisher"
              {...register("publisher")}
              placeholder="Verlag eingeben"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="school">Schulhaus</Label>
            <Controller
              name="school"
              control={control}
              rules={{ required: "Schulhaus ist erforderlich" }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value || "Chriesiweg"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Schulhaus auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHOOLS.map((school) => (
                      <SelectItem key={school} value={school}>
                        {school}
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
              onClick={handleCancel}
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
