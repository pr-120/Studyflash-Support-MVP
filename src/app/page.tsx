"use client";

import { useCallback, useState } from "react";
import { Inbox } from "lucide-react";
import { TicketSidebar } from "@/components/TicketSidebar";
import { ResizeHandle } from "@/components/ResizeHandle";

export default function HomePage() {
  const [sidebarWidth, setSidebarWidth] = useState(380);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(280, Math.min(600, w + delta)));
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <div style={{ width: sidebarWidth }} className="flex-shrink-0">
        <TicketSidebar />
      </div>
      <ResizeHandle onResize={handleSidebarResize} />
      <main className="flex-1 overflow-hidden bg-gray-50">
        <div className="flex h-full flex-col items-center justify-center text-gray-400">
          <Inbox className="mb-3 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">Select a ticket</p>
          <p className="mt-1 text-sm">
            Choose a ticket from the sidebar to view details
          </p>
        </div>
      </main>
    </div>
  );
}
