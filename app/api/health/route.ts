import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Health check endpoint for monitoring application status
 * Used by Docker healthcheck, load balancers, and monitoring tools
 */
export async function GET() {
  try {
    // Check if the application is responsive
    const startTime = Date.now()

    // Optional: Check database connection
    try {
      const supabase = await createClient()
      const { error } = await supabase.from("user_profiles").select("id").limit(1)

      if (error) {
        console.error("[Health Check] Database connection error:", error)
        // Don't fail the health check for database errors in case of temporary issues
      }
    } catch (dbError) {
      console.error("[Health Check] Database check failed:", dbError)
      // Continue - we want to report the app is alive even if DB is temporarily down
    }

    const responseTime = Date.now() - startTime

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      environment: process.env.NODE_ENV,
    }, { status: 200 })

  } catch (error) {
    console.error("[Health Check] Health check failed:", error)

    return NextResponse.json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}
