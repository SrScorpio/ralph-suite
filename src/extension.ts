import * as vscode from 'vscode';
import { _doActivate } from './activate';

function getExtensionVersion(): string {
	const pkg = require('../package.json');
	return pkg.version || 'unknown';
}

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Ralph Suite');
	context.subscriptions.push(output);
	output.appendLine(`[Ralph] ===== ACTIVATING v${getExtensionVersion()} =====`);

	try {
		_doActivate(context, output);
		output.appendLine('[Ralph] ===== ACTIVATION COMPLETE =====');
	} catch (e) {
		output.appendLine(`[Ralph] ===== ACTIVATION FAILED: ${e} =====`);
		output.appendLine(`[Ralph] Stack: ${(e as Error)?.stack ?? 'no stack'}`);
		output.show();
		vscode.window.showErrorMessage(`Ralph Suite activation failed: ${e}`);
	}
}

export function deactivate() {}
