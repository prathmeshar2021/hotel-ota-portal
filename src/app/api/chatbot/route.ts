import { NextRequest, NextResponse } from "next/server";
import { classifyIntent, getRuleBasedResponse } from "@/lib/chatbot/intentHandler";
import { callGemini } from "@/lib/chatbot/geminiService";
import { prisma } from "@/lib/db/prisma";
import { RESORT } from "@/lib/chatbot/resortData";
import { getCategoryMeta } from "@/lib/utils/room-categories";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ChatHistoryItem {
  role: "user" | "bot";
  content: string;
}

interface SessionContext {
  bookingStep?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  availableRooms?: RoomOption[];
  selectedRoom?: RoomOption;
}

interface RoomOption {
  id: string;
  type: string;
  label: string;
  price: number;
  capacity: number;
  accent: string;
}

// ─── Availability DB query ──────────────────────────────────────────────────────
async function getAvailableRooms(checkIn: string, checkOut: string): Promise<RoomOption[]> {
  try {
    const hotel = await prisma.hotel.findUnique({
      where: { slug: RESORT.hotelSlug },
      select: { id: true },
    });

    if (!hotel) return [];

    // Query rooms directly — avoids Prisma type issues with nested relation filters
    const rooms = await prisma.room.findMany({
      where: {
        hotelId: hotel.id,
        isActive: true,
        status: { not: "MAINTENANCE" },
        assignedBookings: {
          none: {
            status: { in: ["CONFIRMED", "CHECKED_IN"] },
            checkInDate: { lt: new Date(checkOut) },
            checkOutDate: { gt: new Date(checkIn) },
          },
        },
      },
      select: {
        id: true,
        roomType: true,
        basePrice: true,
        capacity: true,
      },
      orderBy: { basePrice: "asc" },
    });

    // One representative room per type
    const seen = new Set<string>();
    return rooms
      .filter((r) => {
        if (seen.has(r.roomType)) return false;
        seen.add(r.roomType);
        return true;
      })
      .map((r) => {
        const meta = getCategoryMeta(r.roomType);
        return {
          id: r.id,
          type: r.roomType,
          label: meta.displayName,
          price: r.basePrice,
          capacity: r.capacity,
          accent: meta.accentColor,
        };
      });
  } catch (err) {
    console.error("[Chatbot] DB availability error:", err);
    return [];
  }
}

// ─── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = body.message ?? "";
    const history: ChatHistoryItem[] = body.history ?? [];
    const context: SessionContext = body.context ?? {};

    if (!message.trim()) {
      return NextResponse.json(
        { reply: "Please type a message so I can help you! 😊" },
        { status: 200 }
      );
    }

    // ── Step: user submitted dates (availability check) ────────────────────────
    if (context.bookingStep === "CHECK_AVAILABILITY" && context.checkIn && context.checkOut) {
      const rooms = await getAvailableRooms(context.checkIn, context.checkOut);

      if (rooms.length === 0) {
        return NextResponse.json({
          reply: `😔 No rooms are available for your selected dates.\n\nTry different dates or contact us directly — we sometimes accommodate special requests!\n\n📞 **${RESORT.phone}**`,
          quickReplies: ["Try Other Dates", "Contact Us"],
          context: { bookingStep: undefined },
        });
      }

      return NextResponse.json({
        reply: `✅ **${rooms.length} room type${rooms.length > 1 ? "s" : ""} available** for your dates!\n\nTap a room to select it:`,
        action: { type: "SHOW_ROOMS", rooms },
        context: { availableRooms: rooms, bookingStep: "SELECT_ROOM" },
      });
    }

    // ── Classify intent and return rule-based response ─────────────────────────
    const intent = classifyIntent(message);
    const ruled = getRuleBasedResponse(intent);

    if (ruled) {
      return NextResponse.json({
        reply: ruled.text,
        quickReplies: ruled.quickReplies,
        action: ruled.action,
      });
    }

    // ── Gemini fallback ────────────────────────────────────────────────────────
    const geminiReply = await callGemini(message, history);
    return NextResponse.json({
      reply: geminiReply,
      quickReplies: ["View Rooms", "Check Availability", "Contact Us"],
    });
  } catch (err) {
    console.error("[Chatbot API] Unhandled error:", err);
    return NextResponse.json(
      {
        reply: `Sorry, something went wrong on our end. Please reach us directly at **${RESORT.phone}** — our team is always available! 📞`,
        quickReplies: ["Contact Us"],
      },
      { status: 200 } // 200 so frontend doesn't throw on JSON parse
    );
  }
}
