"use client";

import { useParams } from "next/navigation";
import { TicketSidebar } from "@/components/TicketSidebar";
import { TicketDetail } from "@/components/TicketDetail";

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

  return (
    <div className="flex h-screen overflow-hidden">
      <TicketSidebar />
      <main className="flex-1 overflow-hidden bg-gray-50">
        <TicketDetail ticketId={ticketId} />
      </main>
    </div>
  );
}
