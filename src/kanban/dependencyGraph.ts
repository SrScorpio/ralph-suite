/**
 * dependencyGraph.ts — Visual dependency graph (ADR-006)
 *
 * Renders an SVG showing task dependencies in the Epic view.
 * Blocked tasks (dependencies not completed) are highlighted in amber/red.
 */

import { Prd, Issue } from '../prdManager';

const STATUS_COLOR: Record<string, string> = {
	todo: '#58a6ff',
	inprogress: '#e3b341',
	completed: '#3fb950',
	blocked: '#f85149',
};

/**
 * Build an inline SVG dependency graph for a set of issues within an epic.
 * Nodes are laid out vertically; arrows point from a dependency to its dependent.
 */
export function buildDependencySvg(issues: Issue[], statuses: Record<string, string>): string {
	if (issues.length === 0) { return ''; }
	if (!issues.some(i => i.dependencies && i.dependencies.length > 0)) { return ''; }

	const nodeHeight = 32;
	const nodeGap = 12;
	const padding = 10;
	const labelWidth = 200;
	const graphHeight = issues.length * (nodeHeight + nodeGap) + padding * 2;

	// Map issue id → vertical position (y center)
	const positions: Record<string, number> = {};
	issues.forEach((issue, i) => {
		positions[issue.id] = padding + i * (nodeHeight + nodeGap) + nodeHeight / 2;
	});

	// Build edges: dependency → dependent
	const edges: { from: string; to: string; blocked: boolean }[] = [];
	for (const issue of issues) {
		for (const depId of (issue.dependencies || [])) {
			const depStatus = statuses[depId];
			const blocked = depStatus !== 'completed';
			edges.push({ from: depId, to: issue.id, blocked });
		}
	}

	const totalWidth = labelWidth + 80;

	// Render nodes
	const nodes = issues.map((issue, i) => {
		const y = padding + i * (nodeHeight + nodeGap);
		const status = statuses[issue.id] ?? 'todo';
		const color = STATUS_COLOR[status] ?? STATUS_COLOR.todo;
		const label = escapeXml(`${issue.id} · ${issue.title.slice(0, 24)}`);
		const blocked = issue.dependencies?.some((d: string) => statuses[d] !== 'completed');
		const strokeColor = blocked ? '#e3b341' : color;
		return `<g>
  <rect x="${padding}" y="${y}" width="${labelWidth}" height="${nodeHeight}" rx="5" fill="${color}22" stroke="${strokeColor}" stroke-width="1.5"/>
  <circle cx="${padding + 8}" cy="${y + nodeHeight / 2}" r="4" fill="${color}"/>
  <text x="${padding + 20}" y="${y + 20}" font-size="11" fill="#e6edf3" font-family="monospace">${label}${blocked ? ' ⛓' : ''}</text>
</g>`;
	}).join('');

	// Render edges (arrows from dependency on the left side)
	const arrows = edges.map(edge => {
		const fromY = positions[edge.from];
		const toY = positions[edge.to];
		if (fromY === undefined || toY === undefined) { return ''; }
		const x1 = padding - 5;
		const x2 = padding;
		const arrowColor = edge.blocked ? '#f85149' : '#3fb950';
		// Curved path from the left edge of the dependency node to the dependent node
		return `<path d="M ${x1} ${fromY} C ${x1 - 30} ${fromY}, ${x1 - 30} ${toY}, ${x2} ${toY}" stroke="${arrowColor}" stroke-width="1.5" fill="none" marker-end="url(#arrow-${edge.blocked ? 'blocked' : 'ok'})"/>`;
	}).join('');

	return `<svg width="${totalWidth}" height="${graphHeight}" viewBox="0 0 ${totalWidth} ${graphHeight}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;overflow:auto">
  <defs>
    <marker id="arrow-ok" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3fb950"/></marker>
    <marker id="arrow-blocked" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f85149"/></marker>
  </defs>
  ${arrows}
  ${nodes}
</svg>`;
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
