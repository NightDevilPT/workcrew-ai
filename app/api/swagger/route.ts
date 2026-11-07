import { NextRequest, NextResponse } from 'next/server'
import { getOpenApiSpec, getOpenApiStats } from '@/services/swagger/swagger.service'

/**
 * GET /api/swagger - Returns the complete OpenAPI specification
 *
 * @query stats - Include specification statistics alongside the spec (optional)
 *
 * @returns JSON response with the OpenAPI specification
 *
 * @example
 * GET /api/swagger
 * GET /api/swagger?stats=true
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        // No caching in development so new or moved endpoints show up on refresh
        const cacheControl =
            process.env.NODE_ENV === 'production'
                ? 'public, max-age=3600'
                : 'no-store'
        const { searchParams } = new URL(req.url)
        const includeStats = searchParams.get('stats') === 'true'

        const spec = getOpenApiSpec()

        // Optionally include statistics in response
        if (includeStats) {
            const stats = getOpenApiStats()
            return NextResponse.json(
                {
                    spec,
                    stats
                },
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': cacheControl,
                        'X-API-Paths': String(stats.totalPaths),
                        'X-API-Endpoints': String(stats.totalEndpoints),
                        'X-API-Schemas': String(stats.totalSchemas)
                    }
                }
            )
        }

        return NextResponse.json(spec, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': cacheControl
            }
        })
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'OPENAPI_SPEC_ERROR',
                    message: 'Failed to generate OpenAPI specification',
                    details: error instanceof Error ? error.message : 'Unknown error'
                }
            },
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        )
    }
}