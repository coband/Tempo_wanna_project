import React, { useState } from 'react';
import { PdfChat } from '@/components/books/PdfChat';
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

export default function PdfChatPage() {
  // Chat ist standardmäßig geöffnet
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <ProtectedRoute>
      <div className="h-screen bg-gray-50 flex flex-col">
        <DashboardHeader className="flex-shrink-0" />
        <div className="flex-1 h-[calc(100vh-4rem)] overflow-hidden">
          <PdfChat open={chatOpen} onOpenChange={setChatOpen} fullScreen={true} />
        </div>
      </div>
    </ProtectedRoute>
  );
} 