import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * CLIP search — requires a dedicated CLIP container.
 * Currently returns empty results when the CLIP service is not available.
 * TODO: Deploy CLIP model as a separate container and restore functionality.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // CLIP service requires a dedicated container with the model
        // Return empty results gracefully when not available
        console.log("[clip/search] CLIP service not configured — returning empty results");
        return NextResponse.json({ results: [] });
    } catch (e: any) {
        console.error("[clip/search] Error:", e);
        return NextResponse.json({ error: "Internal server error", results: [] }, { status: 500 });
    }
}
