import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, XCircle } from "lucide-react";
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
  
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2 mb-4 p-4 border rounded-md bg-gray-50">
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
          <select 
            className="w-full px-3 py-2 border rounded-md"
            value={selectedSchool}
            onChange={(e) => onSchoolChange(e.target.value)}
          >
            <option value="">Alle Schulhäuser</option>
            {schools.map(school => (
              <option key={school} value={school}>{school}</option>
            ))}
          </select>
        </div>

        {/* Buchtyp-Filter */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-sm font-medium">Buchtyp</Label>
          <select 
            className="w-full px-3 py-2 border rounded-md"
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="">Alle Typen</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
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
          <select 
            className="w-full px-3 py-2 border rounded-md"
            value={selectedAvailability === null ? "" : selectedAvailability ? "true" : "false"}
            onChange={(e) => {
              if (e.target.value === "") {
                onAvailabilityChange(null);
              } else {
                onAvailabilityChange(e.target.value === "true");
              }
            }}
          >
            <option value="">Alle</option>
            <option value="true">Verfügbar</option>
            <option value="false">Ausgeliehen</option>
          </select>
        </div>
        
        {/* Standort-Filter */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-sm font-medium">Standort</Label>
          <select 
            className="w-full px-3 py-2 border rounded-md"
            value={selectedLocation}
            onChange={(e) => onLocationChange(e.target.value)}
          >
            <option value="">Alle Standorte</option>
            {locations.map(location => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Aktive Filter anzeigen und Reset-Button */}
      {hasActiveFilters && (
        <div className="flex justify-between mb-4">
          <div className="flex flex-wrap gap-2">
            {selectedLevels.length > 0 && (
              <Badge variant="secondary" className="px-2 py-1">
                Stufen: {selectedLevels.join(', ')}
              </Badge>
            )}
            {selectedSchool && (
              <Badge variant="secondary" className="px-2 py-1">
                Schulhaus: {selectedSchool}
              </Badge>
            )}
            {selectedType && (
              <Badge variant="secondary" className="px-2 py-1">
                Typ: {selectedType}
              </Badge>
            )}
            {selectedSubjects.length > 0 && (
              <Badge variant="secondary" className="px-2 py-1">
                Fächer: {selectedSubjects.join(', ')}
              </Badge>
            )}
            {(selectedYearRange[0] !== yearRange[0] || selectedYearRange[1] !== yearRange[1]) && (
              <Badge variant="secondary" className="px-2 py-1">
                Jahr: {selectedYearRange[0]} - {selectedYearRange[1]}
              </Badge>
            )}
            {selectedAvailability !== null && (
              <Badge variant="secondary" className="px-2 py-1">
                Verfügbarkeit: {selectedAvailability ? 'Verfügbar' : 'Ausgeliehen'}
              </Badge>
            )}
            {selectedLocation && (
              <Badge variant="secondary" className="px-2 py-1">
                Standort: {selectedLocation}
              </Badge>
            )}
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onClearFilters}
            className="flex items-center gap-1"
          >
            <XCircle className="h-4 w-4" />
            Filter zurücksetzen
          </Button>
        </div>
      )}
    </div>
  );
} 