import React, { useState, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ChevronDown, XCircle, Filter, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FilterProps {
  // Stufenfilter
  levels: string[];
  selectedLevels: string[];
  onLevelChange: (levels: string[]) => void;
  
  // Schulhaus-Filter
  schools: string[];
  selectedSchool: string;
  onSchoolChange: (school: string) => void;
  
  // Buchtyp-Filter
  types: string[];
  selectedType: string;
  onTypeChange: (type: string) => void;
  
  // Fach-Filter
  subjects: string[];
  selectedSubjects: string[];
  onSubjectChange: (subjects: string[]) => void;
  
  // Erscheinungsjahr-Filter
  yearRange: [number, number];
  selectedYearRange: [number, number];
  onYearRangeChange: (range: [number, number]) => void;
  
  // Verfügbarkeit-Filter
  selectedAvailability: boolean | null;
  onAvailabilityChange: (available: boolean | null) => void;
  
  // Standort-Filter
  locations: string[];
  selectedLocation: string;
  onLocationChange: (location: string) => void;

  // Alle Filter zurücksetzen
  onClearFilters: () => void;
}

export function BookFilter({
  // Stufenfilter
  levels,
  selectedLevels,
  onLevelChange,
  
  // Schulhaus-Filter
  schools,
  selectedSchool,
  onSchoolChange,
  
  // Buchtyp-Filter
  types,
  selectedType,
  onTypeChange,
  
  // Fach-Filter
  subjects,
  selectedSubjects,
  onSubjectChange,
  
  // Erscheinungsjahr-Filter
  yearRange,
  selectedYearRange,
  onYearRangeChange,
  
  // Verfügbarkeit-Filter
  selectedAvailability,
  onAvailabilityChange,
  
  // Standort-Filter
  locations,
  selectedLocation,
  onLocationChange,
  
  // Filter zurücksetzen
  onClearFilters
}: FilterProps) {
  // Setze isFilterOpen initial auf false für konsistentes Verhalten
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Verhindert initiales Rendering mit geöffneten Filtern
  const [isInitialRender, setIsInitialRender] = useState(true);
  // Flag, um zu verfolgen, ob der Filter manuell geschlossen wurde
  const [manuallyToggled, setManuallyToggled] = useState(false);

  // Überprüfen, ob es sich um ein mobiles Gerät handelt und Filter schließen
  // Verwende useLayoutEffect statt useEffect für bessere visuelle Performance
  useLayoutEffect(() => {
    const checkIfMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Wir schließen den Filter nicht automatisch bei Mobilgeräten
      // if (mobile) {
      //   setIsFilterOpen(false);
      // }
    };
    
    // Initial check
    checkIfMobile();
    setIsInitialRender(false);
    
    // Event listener für Fenstergrößenänderungen
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Stelle sicher, dass Filter beim ersten Laden geschlossen sind
  useEffect(() => {
    if (isMobile) {
      setIsFilterOpen(false);
      setManuallyToggled(false);
    }
  }, [isMobile]);

  const toggleLevel = (level: string) => {
    if (selectedLevels.includes(level)) {
      onLevelChange(selectedLevels.filter(l => l !== level));
    } else {
      onLevelChange([...selectedLevels, level]);
    }
  };
  
  const toggleSubject = (subject: string) => {
    if (selectedSubjects.includes(subject)) {
      onSubjectChange(selectedSubjects.filter(s => s !== subject));
    } else {
      onSubjectChange([...selectedSubjects, subject]);
    }
  };
  
  // Prüfen, ob Filter aktiv sind
  const hasActiveFilters = 
    selectedLevels.length > 0 || 
    selectedSchool !== "" || 
    selectedType !== "" || 
    selectedSubjects.length > 0 || 
    selectedYearRange[0] !== yearRange[0] || 
    selectedYearRange[1] !== yearRange[1] || 
    selectedAvailability !== null || 
    selectedLocation !== "";

  // Anzahl der aktiven Filter für Badge
  const activeFilterCount = 
    (selectedLevels.length > 0 ? 1 : 0) + 
    (selectedSchool !== "" ? 1 : 0) + 
    (selectedType !== "" ? 1 : 0) + 
    (selectedSubjects.length > 0 ? 1 : 0) + 
    ((selectedYearRange[0] !== yearRange[0] || selectedYearRange[1] !== yearRange[1]) ? 1 : 0) + 
    (selectedAvailability !== null ? 1 : 0) + 
    (selectedLocation !== "" ? 1 : 0);
  
  // Filterinhalt, der entweder direkt oder in einem Collapsible angezeigt wird
  const FilterContent = () => (
    <div className="flex flex-wrap gap-2 p-4 border rounded-md bg-gray-50">
      {/* Stufenfilter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Stufe</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {selectedLevels.length ? selectedLevels.join(', ') : "Alle Stufen"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="grid gap-2">
              {levels.map((level) => (
                <div className="flex items-center space-x-2" key={level}>
                  <Checkbox 
                    id={`filter-level-${level}`}
                    checked={selectedLevels.includes(level)}
                    onCheckedChange={() => toggleLevel(level)}
                  />
                  <label 
                    htmlFor={`filter-level-${level}`}
                    className="text-sm cursor-pointer w-full"
                  >
                    {level}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Schulhaus-Filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Schulhaus</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {selectedSchool ? selectedSchool : "Alle Schulhäuser"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="grid gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="filter-school-all"
                  checked={selectedSchool === ""}
                  onCheckedChange={() => onSchoolChange("")}
                />
                <label 
                  htmlFor="filter-school-all"
                  className="text-sm cursor-pointer w-full"
                >
                  Alle Schulhäuser
                </label>
              </div>
              {schools.map((school) => (
                <div className="flex items-center space-x-2" key={school}>
                  <Checkbox 
                    id={`filter-school-${school}`}
                    checked={selectedSchool === school}
                    onCheckedChange={() => onSchoolChange(selectedSchool === school ? "" : school)}
                  />
                  <label 
                    htmlFor={`filter-school-${school}`}
                    className="text-sm cursor-pointer w-full"
                  >
                    {school}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Buchtyp-Filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Buchtyp</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {selectedType ? selectedType : "Alle Typen"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="grid gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="filter-type-all"
                  checked={selectedType === ""}
                  onCheckedChange={() => onTypeChange("")}
                />
                <label 
                  htmlFor="filter-type-all"
                  className="text-sm cursor-pointer w-full"
                >
                  Alle Typen
                </label>
              </div>
              {types.map((type) => (
                <div className="flex items-center space-x-2" key={type}>
                  <Checkbox 
                    id={`filter-type-${type}`}
                    checked={selectedType === type}
                    onCheckedChange={() => onTypeChange(selectedType === type ? "" : type)}
                  />
                  <label 
                    htmlFor={`filter-type-${type}`}
                    className="text-sm cursor-pointer w-full"
                  >
                    {type}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Fach-Filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Fach</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {selectedSubjects.length ? selectedSubjects.join(', ') : "Alle Fächer"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="grid gap-2">
              {subjects.map((subject) => (
                <div className="flex items-center space-x-2" key={subject}>
                  <Checkbox 
                    id={`filter-subject-${subject}`}
                    checked={selectedSubjects.includes(subject)}
                    onCheckedChange={() => toggleSubject(subject)}
                  />
                  <label 
                    htmlFor={`filter-subject-${subject}`}
                    className="text-sm cursor-pointer w-full"
                  >
                    {subject}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Erscheinungsjahr-Filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Erscheinungsjahr</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {(selectedYearRange[0] !== yearRange[0] || selectedYearRange[1] !== yearRange[1]) 
                  ? `${selectedYearRange[0]} - ${selectedYearRange[1]}` 
                  : "Alle Jahre"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-4" align="start">
            <div className="space-y-4">
              <div className="text-sm text-center">
                {selectedYearRange[0]} - {selectedYearRange[1]}
              </div>
              <Slider
                min={yearRange[0]}
                max={yearRange[1]}
                step={1}
                value={selectedYearRange}
                onValueChange={(value) => onYearRangeChange(value as [number, number])}
                className="w-full"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Verfügbarkeit-Filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Verfügbarkeit</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {selectedAvailability === null 
                  ? "Alle" 
                  : selectedAvailability 
                    ? "Verfügbar" 
                    : "Ausgeliehen"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="grid gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="filter-availability-all"
                  checked={selectedAvailability === null}
                  onCheckedChange={() => onAvailabilityChange(null)}
                />
                <label 
                  htmlFor="filter-availability-all"
                  className="text-sm cursor-pointer w-full"
                >
                  Alle
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="filter-availability-available"
                  checked={selectedAvailability === true}
                  onCheckedChange={() => onAvailabilityChange(selectedAvailability === true ? null : true)}
                />
                <label 
                  htmlFor="filter-availability-available"
                  className="text-sm cursor-pointer w-full"
                >
                  Verfügbar
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="filter-availability-unavailable"
                  checked={selectedAvailability === false}
                  onCheckedChange={() => onAvailabilityChange(selectedAvailability === false ? null : false)}
                />
                <label 
                  htmlFor="filter-availability-unavailable"
                  className="text-sm cursor-pointer w-full"
                >
                  Ausgeliehen
                </label>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Standort-Filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Label className="text-sm font-medium">Standort</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              role="combobox" 
              className="justify-between"
            >
              <span className="truncate">
                {selectedLocation ? selectedLocation : "Alle Standorte"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="grid gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="filter-location-all"
                  checked={selectedLocation === ""}
                  onCheckedChange={() => onLocationChange("")}
                />
                <label 
                  htmlFor="filter-location-all"
                  className="text-sm cursor-pointer w-full"
                >
                  Alle Standorte
                </label>
              </div>
              {locations.map((location) => (
                <div className="flex items-center space-x-2" key={location}>
                  <Checkbox 
                    id={`filter-location-${location}`}
                    checked={selectedLocation === location}
                    onCheckedChange={() => onLocationChange(selectedLocation === location ? "" : location)}
                  />
                  <label 
                    htmlFor={`filter-location-${location}`}
                    className="text-sm cursor-pointer w-full"
                  >
                    {location}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
  
  // Funktion zum Umschalten des Filters mit Tracking
  const toggleFilter = (open: boolean) => {
    setIsFilterOpen(open);
    setManuallyToggled(true);
  };

  // Mobile Filter-Button mit Dropdown
  if (isMobile) {
    return (
      <div className="px-4 mb-3 mt-3">
        <div className="flex justify-between items-center">
          <Collapsible 
            open={isFilterOpen} 
            onOpenChange={toggleFilter}
            className="w-full"
          >
            <div className="flex justify-between items-center">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="outline" 
                  className="mb-2"
                  onClick={() => setManuallyToggled(true)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  <span>Filter</span>
                  {activeFilterCount > 0 && (
                    <Badge 
                      variant="secondary" 
                      className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearFilters();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  <span>Zurücksetzen</span>
                </Button>
              )}
            </div>
            <CollapsibleContent 
              className="mt-2"
              style={{ position: 'absolute', width: 'calc(100% - 2rem)', backgroundColor: 'white', zIndex: 50, borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
            >
              <FilterContent />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    );
  }

  // Desktop Filter mit festen Checkboxen
  return (
    <div className="px-4 mb-3 mt-3">
      {isInitialRender ? null : (
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center">
              <SlidersHorizontal className="h-4 w-4 mr-2 text-gray-500" />
              <h3 className="text-lg font-medium">Filter</h3>
              {activeFilterCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClearFilters}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="h-4 w-4 mr-1" />
                <span>Filter zurücksetzen</span>
              </Button>
            )}
          </div>
          <FilterContent />
        </div>
      )}
    </div>
  );
} 