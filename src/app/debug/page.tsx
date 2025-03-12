import { Suspense } from 'react';
import TestDebug from '@/components/TestDebug';

export default function DebugPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">API Debug Seite</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <Suspense fallback={<div>Lade...</div>}>
          <TestDebug />
        </Suspense>
      </div>
    </div>
  );
} 