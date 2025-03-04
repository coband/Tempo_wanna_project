import React, { useState } from 'react';
import { Button } from '../ui/button';
import { MessageSquare } from 'lucide-react';
import { BookChat } from './BookChat';

export function ChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setIsOpen(true)}
        variant="default"
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
        <span className="sr-only">Buch-Chatbot öffnen</span>
      </Button>

      <BookChat open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
} 