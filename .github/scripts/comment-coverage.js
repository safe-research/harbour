module.exports = async ({ github, context, core }) => {
	const fs = require("fs");
	const path = "webapp/coverage/coverage-summary.json";

	if (!fs.existsSync(path)) {
		core.setFailed(`Missing ${path}. Did Vitest run with json-summary reporter?`);
		return;
	}

	const summary = JSON.parse(fs.readFileSync(path, "utf8"));
	const t = summary.total;
	const pct = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

	const artifactUrl = process.env.ARTIFACT_URL;

	const body = `
<!-- vitest-coverage-comment -->
## Test Coverage
| Metric | % | Covered / Total |
|---|---:|---:|
| Statements | ${pct(t.statements.pct)}% | ${t.statements.covered} / ${t.statements.total} |
| Branches   | ${pct(t.branches.pct)}%   | ${t.branches.covered} / ${t.branches.total} |
| Functions  | ${pct(t.functions.pct)}%  | ${t.functions.covered} / ${t.functions.total} |
| Lines      | ${pct(t.lines.pct)}%      | ${t.lines.covered} / ${t.lines.total} |

**HTML report:** ${artifactUrl ? `[Download / view](${artifactUrl})` : "_(artifact URL unavailable)_"}
`;

	const { owner, repo } = context.repo;
	const issue_number = context.payload.pull_request.number;

	const { data: comments } = await github.rest.issues.listComments({
		owner,
		repo,
		issue_number,
	});

	const existing = comments.find((c) => c.body?.includes("vitest-coverage-comment"));

	if (existing) {
		await github.rest.issues.updateComment({
			owner,
			repo,
			comment_id: existing.id,
			body,
		});
	} else {
		await github.rest.issues.createComment({
			owner,
			repo,
			issue_number,
			body,
		});
	}
};
