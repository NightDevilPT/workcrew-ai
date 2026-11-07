import { Metadata } from "next";
import SwaggerUIComponent from "./_components";
import { CurrentYear } from "./_components/current-year";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Code2, FileJson } from "lucide-react";

/**
 * Metadata for the API documentation page
 */
export const metadata: Metadata = {
	title: "API Documentation | Workcrew AI",
	description:
		"Interactive API documentation for the Workcrew AI platform - explore and test endpoints with live examples",
	robots: {
		index: true,
		follow: true,
	},
	openGraph: {
		title: "Workcrew AI API Documentation",
		description:
			"Comprehensive API documentation with interactive testing capabilities",
		type: "website",
	},
};

/**
 * API Documentation Page
 *
 * Swagger UI interface for exploring and testing the Workcrew AI API endpoints.
 * Provides interactive documentation with the ability to try out API calls directly from the browser.
 */
export default function ApiDocsPage() {
	return (
		<div className="min-h-screen w-full bg-muted/30">
			{/* Hero Header Section */}
			<div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
				<div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
					<div className="flex items-center gap-3 mb-4">
						<div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
							<BookOpen className="h-8 w-8" />
						</div>
						<div className="flex items-center gap-3">
							<h1 className="text-4xl font-bold">
								Workcrew AI API Documentation
							</h1>
							<Badge variant="secondary">v1.0.0</Badge>
						</div>
					</div>
					<p className="text-lg text-primary-foreground/80 max-w-3xl">
						Explore and test every Workcrew AI endpoint directly from
						the browser - tickets, boards, workflows, and the agent
						execution APIs.
					</p>
				</div>
			</div>

			{/* Main Swagger UI Container */}
			<div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<Card className="overflow-hidden py-0">
					<CardHeader className="border-b bg-muted/50 py-4">
						<div className="flex items-center justify-between">
							<CardTitle className="flex items-center gap-3 text-lg">
								<Code2 className="h-5 w-5 text-muted-foreground" />
								API Endpoints
							</CardTitle>
							<a
								href="/api/swagger"
								target="_blank"
								rel="noopener noreferrer"
								className={buttonVariants({ size: "sm" })}
							>
								<FileJson className="h-4 w-4" />
								View OpenAPI Spec
							</a>
						</div>
					</CardHeader>

					{/* Swagger UI Component */}
					<CardContent className="p-0">
						<SwaggerUIComponent url="/api/swagger" />
					</CardContent>
				</Card>
			</div>

			{/* Footer */}
			<div className="border-t bg-background">
				<div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
					<p className="text-muted-foreground text-sm">
						&copy; <CurrentYear /> Workcrew AI. All rights reserved.
					</p>
				</div>
			</div>
		</div>
	);
}
