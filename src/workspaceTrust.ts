import * as vscode from 'vscode';

export function requireWorkspaceTrust(action: string): boolean {
	if (vscode.workspace.isTrusted) { return true; }
	vscode.window.showErrorMessage(`Ralph: no se puede ${action} porque el workspace no es de confianza.`);
	return false;
}
