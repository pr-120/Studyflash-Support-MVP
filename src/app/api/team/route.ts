import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const members = await prisma.teamMember.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { tickets: true } },
    },
  });

  return NextResponse.json(members);
}

const CreateMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  avatar: z.string().url().optional(),
  role: z.string().default("support"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const data = CreateMemberSchema.parse(body);

  const member = await prisma.teamMember.create({ data });
  return NextResponse.json(member, { status: 201 });
}
