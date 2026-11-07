"use client";

import { useEffect, useState } from "react";

const BUILD_TIME_FALLBACK_YEAR = new Date().getFullYear();

export function CurrentYear() {
	const [year, setYear] = useState<number | null>(null);

	useEffect(() => {
		setYear(new Date().getFullYear());
	}, []);

	return <>{year ?? BUILD_TIME_FALLBACK_YEAR}</>;
}
