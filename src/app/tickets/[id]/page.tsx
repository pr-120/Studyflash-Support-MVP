"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { TicketSidebar } from "@/components/TicketSidebar";
import { TicketDetail } from "@/components/TicketDetail";
import { ResizeHandle } from "@/components/ResizeHandle";

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

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
        <TicketDetail ticketId={ticketId} />
      </main>
    </div>
  );
}
