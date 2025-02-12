import React from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { MapPin, BookOpen } from "lucide-react";

interface Book {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  available: boolean;
  location: string;
  genre: string;
}

interface BookGridProps {
  books?: Book[];
}

const defaultBooks: Book[] = [
  {
    id: "1",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    coverImage:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop",
    available: true,
    location: "Fiction - F234",
    genre: "Classic Literature",
  },
  {
    id: "2",
    title: "1984",
    author: "George Orwell",
    coverImage:
      "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&h=400&fit=crop",
    available: false,
    location: "Science Fiction - O784",
    genre: "Science Fiction",
  },
  {
    id: "3",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    coverImage:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop",
    available: true,
    location: "Classic - A935",
    genre: "Romance",
  },
];

const BookGrid = ({ books = defaultBooks }: BookGridProps) => {
  return (
    <div className="bg-white p-6 min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {books.map((book) => (
          <Card key={book.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg">{book.title}</h3>
                <Badge
                  className={book.available ? "bg-green-500" : "bg-red-500"}
                >
                  {book.available ? "Available" : "Checked Out"}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mb-3">{book.author}</p>
              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="w-full">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{book.location}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Shelf Location: {book.location}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-500">{book.genre}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default BookGrid;
