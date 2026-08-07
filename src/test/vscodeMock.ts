import Module = require('module');

const originalLoad = (Module as any)._load;

// Singleton mock — every import of 'vscode' gets the SAME object so that
// tests can spy/mutate vscode.commands.executeCommand etc. and the change
// is observed by modules that captured their reference at import time.
const noopDisposable = { dispose: () => undefined };
const configuration = {
	get: (_key: string, fallback: unknown) => fallback,
};

const commandsApi = {
	executeCommand: async () => undefined,
	registerCommand: () => noopDisposable,
};

const envApi = {
	language: 'en',
	locale: 'en',
	clipboard: { writeText: async () => undefined },
};

const windowApi = {
	activeTextEditor: undefined,
	createOutputChannel: () => ({
		appendLine: () => undefined,
		show: () => undefined,
		dispose: () => undefined,
	}),
	createStatusBarItem: () => ({
		text: '',
		tooltip: '',
		command: '',
		show: () => undefined,
		dispose: () => undefined,
	}),
	createWebviewPanel: () => ({
		title: '',
		webview: {
			html: '',
			options: {},
			postMessage: async () => true,
			onDidReceiveMessage: () => noopDisposable,
		},
		onDidDispose: () => noopDisposable,
		reveal: () => undefined,
	}),
	showErrorMessage: async () => undefined,
	showInformationMessage: async () => undefined,
	showInputBox: async () => undefined,
	showOpenDialog: async () => undefined,
	showQuickPick: async () => undefined,
	showTextDocument: async () => undefined,
	showWarningMessage: async () => undefined,
};

const workspaceApi = {
	createFileSystemWatcher: () => ({
		onDidChange: () => noopDisposable,
		onDidCreate: () => noopDisposable,
		onDidDelete: () => noopDisposable,
		dispose: () => undefined,
	}),
	getConfiguration: () => configuration,
	openTextDocument: async () => ({}),
	workspaceFolders: [],
};

const vscodeMock = {
	commands: commandsApi,
	env: envApi,
	RelativePattern: class RelativePattern {
		constructor(public base: string, public pattern: string) {}
	},
	ViewColumn: { Beside: 2 },
	StatusBarAlignment: { Left: 1 },
	window: windowApi,
	workspace: workspaceApi,
	Uri: {},
};

(Module as any)._load = function mockVscode(request: string, parent: unknown, isMain: boolean) {
	if (request !== 'vscode') {
		return originalLoad.apply(this, arguments as any);
	}
	return vscodeMock;
};
