import { Alert, Link, Typography } from "@mui/material";
import type { ReactNode } from "react";

export const CustomLink = ({
	to,
	children,
}: {
	to: string;
	children: ReactNode;
}) => {
	return (
		<Link
			href={to}
			target="_blank"
			rel="noopener"
			underline="none"
			color="inherit"
			sx={{ ":hover": { color: "#12ff80" } }}
		>
			{children}
		</Link>
	);
};

export const SafeResearchBanner = () => {
	return (
		<Alert severity="warning">
			This demo is an experimental beta release. Code is not audited. Use at
			your own risk.
		</Alert>
	);
};

export const SafeResearchFooter = ({ repo }: { repo: string }) => {
	return (
		<Typography>
			<CustomLink to="https://github.com/safe-research">
				Built by Safe Research
			</CustomLink>
			&nbsp;&hearts;&nbsp;
			<CustomLink to={`https://github.com/safe-research/${repo}`}>
				Source on GitHub
			</CustomLink>
		</Typography>
	);
};
