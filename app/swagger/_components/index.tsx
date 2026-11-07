"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

interface SwaggerUIComponentProps {
	url?: string;
	spec?: object;
}

export default function SwaggerUIComponent({
	url,
	spec,
}: SwaggerUIComponentProps) {
	return (
		<div className="swagger-ui-wrapper">
			<SwaggerUI
				url={url}
				spec={spec}
				docExpansion="list"
				defaultModelsExpandDepth={1}
				defaultModelExpandDepth={1}
				requestInterceptor={(req) => {
					// 1. Instruct browser to attach stored cookies natively
					req.credentials = "include";

					// 3. Normalize Cookie header & browser document.cookie
					const rawHeader =
						req.headers?.Cookie ||
						req.headers?.cookie ||
						req.headers?.["Cookie"] ||
						req.headers?.["cookie"];

					if (rawHeader) {
						let text = String(rawHeader).trim();

						// Remove outer 'token=' prefix added by OpenAPI CookieAuth scheme
						if (text.startsWith("token=")) {
							text = text.slice(6);
						}

						// Decode initial encoding to parse JSON boundaries accurately
						let decoded = text;
						try {
							decoded = decodeURIComponent(text);
						} catch {
							// Ignore if already plain text
						}

						// Extract the user cookie (captures entire JSON object including spaces)
						let userVal = "";
						const userJsonMatch = decoded.match(
							/user=({.*?})(?=;\s*token=|$|;)/,
						);
						if (userJsonMatch && userJsonMatch[1]) {
							try {
								// Parse and URL-encode the JSON so quotes and spaces don't break the cookie header
								const parsedUser = JSON.parse(
									userJsonMatch[1].trim(),
								);
								userVal = encodeURIComponent(
									JSON.stringify(parsedUser),
								);
							} catch {
								userVal = encodeURIComponent(
									userJsonMatch[1].trim(),
								);
							}
						}

						// Extract the token cookie (raw JWT)
						let tokenVal = "";
						const tokenMatch = decoded.match(/token=([^\s;]+)/);
						if (tokenMatch && tokenMatch[1]) {
							tokenVal = tokenMatch[1].trim();
						} else if (decoded.includes("eyJ")) {
							const jwtMatch = decoded.match(
								/eyJ[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+/,
							);
							if (jwtMatch) {
								tokenVal = jwtMatch[0];
							}
						}

						// Assemble clean, properly encoded multi-cookie string
						const cookieParts: string[] = [];
						if (userVal) cookieParts.push(`user=${userVal}`);
						if (tokenVal) cookieParts.push(`token=${tokenVal}`);
						const formattedCookieString = cookieParts.join("; ");

						// Clean up and assign exactly once to avoid duplicates
						if (req.headers) {
							delete req.headers.cookie;
							delete req.headers["cookie"];
							delete req.headers["Cookie"];
							req.headers.Cookie = formattedCookieString;
						}

						// Set browser cookies so outgoing fetch requests include them
						if (typeof document !== "undefined") {
							if (userVal) {
								document.cookie = `user=${userVal}; path=/; SameSite=Lax`;
							}
							if (tokenVal) {
								document.cookie = `token=${tokenVal}; path=/; SameSite=Lax`;
							}
						}
					}

					return req;
				}}
			/>
		</div>
	);
}
