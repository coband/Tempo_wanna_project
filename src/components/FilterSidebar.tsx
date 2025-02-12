import React from "react";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { X } from "lucide-react";

interface FilterSidebarProps {
  onFilterChange?: (filters: FilterState) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface FilterState {
  genres: string[];
  levels: string[];
  yearRange: [number, number];
  availability: string[];
  location: string[];
}

const defaultGenres = [
  "Mathematik",
  "Deutsch",
  "Französisch",
  "NMG",
  "Sport",
  "Musik",
  "Englisch",
  "Bildnerisches Gestalten",
  "TTG",
  "Divers",
];

const defaultLevels = ["KiGa", "Unterstufe", "Mittelstufe"];

const defaultLocations = [
  "Bibliothek",
  "Lehrerzimmer",
  "Klassenzimmer",
  "Materialraum",
  "Archiv",
];

const defaultAvailability = ["Verfügbar", "Ausgeliehen"];

const FilterSidebar = ({
  onFilterChange = () => {},
  isOpen = true,
  onClose = () => {},
}: FilterSidebarProps) => {
  const [filters, setFilters] = React.useState<FilterState>({
    genres: [],
    levels: [],
    yearRange: [1900, 2025],
    availability: [],
    location: [],
  });

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };
    console.log("Updating filters:", { old: filters, new: updatedFilters });
    setFilters(updatedFilters);
    onFilterChange(updatedFilters);
  };

  if (!isOpen) return null;

  return (
    <div className="w-[280px] h-full bg-white border-r border-gray-200 p-4 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Filters</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6">
          {/* Genre Filter */}
          <div className="space-y-4">
            <h3 className="font-medium">Fach</h3>
            <div className="space-y-2">
              {defaultGenres.map((genre) => (
                <div key={genre} className="flex items-center space-x-2">
                  <Checkbox
                    id={`genre-${genre}`}
                    checked={filters.genres.includes(genre)}
                    onCheckedChange={(checked) => {
                      const newGenres = checked
                        ? [...filters.genres, genre]
                        : filters.genres.filter((g) => g !== genre);
                      handleFilterChange({ genres: newGenres });
                    }}
                  />
                  <Label htmlFor={`genre-${genre}`}>{genre}</Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Level Filter */}
          <div className="space-y-4">
            <h3 className="font-medium">Stufe</h3>
            <div className="space-y-2">
              {defaultLevels.map((level) => (
                <div key={level} className="flex items-center space-x-2">
                  <Checkbox
                    id={`level-${level}`}
                    checked={filters.levels.includes(level)}
                    onCheckedChange={(checked) => {
                      const newLevels = checked
                        ? [...filters.levels, level]
                        : filters.levels.filter((l) => l !== level);
                      handleFilterChange({ levels: newLevels });
                    }}
                  />
                  <Label htmlFor={`level-${level}`}>{level}</Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Publication Year Filter */}
          <div className="space-y-4">
            <h3 className="font-medium">Erscheinungsjahr</h3>
            <div className="w-[200px] space-y-2">
              <Slider
                min={1900}
                max={2025}
                step={1}
                value={filters.yearRange}
                onValueChange={(value) =>
                  handleFilterChange({ yearRange: value as [number, number] })
                }
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{filters.yearRange[0]}</span>
                <span>{filters.yearRange[1]}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Availability Filter */}
          <div className="space-y-4">
            <h3 className="font-medium">Verfügbarkeit</h3>
            <div className="space-y-2">
              {defaultAvailability.map((status) => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`availability-${status}`}
                    checked={filters.availability.includes(status)}
                    onCheckedChange={(checked) => {
                      const newAvailability = checked
                        ? [...filters.availability, status]
                        : filters.availability.filter((s) => s !== status);
                      handleFilterChange({ availability: newAvailability });
                    }}
                  />
                  <Label htmlFor={`availability-${status}`}>{status}</Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Location Filter */}
          <div className="space-y-4">
            <h3 className="font-medium">Standort</h3>
            <div className="space-y-2">
              {defaultLocations.map((location) => (
                <div key={location} className="flex items-center space-x-2">
                  <Checkbox
                    id={`location-${location}`}
                    checked={filters.location.includes(location)}
                    onCheckedChange={(checked) => {
                      const newLocations = checked
                        ? [...filters.location, location]
                        : filters.location.filter((l) => l !== location);
                      handleFilterChange({ location: newLocations });
                    }}
                  />
                  <Label htmlFor={`location-${location}`}>{location}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      <Separator className="my-4" />

      <Button
        onClick={() => {
          const clearedFilters = {
            genres: [],
            yearRange: [1900, 2024],
            availability: [],
            location: [],
          };
          setFilters(clearedFilters);
          onFilterChange(clearedFilters);
        }}
        variant="outline"
        className="w-full"
      >
        Clear Filters
      </Button>
    </div>
  );
};

export default FilterSidebar;
