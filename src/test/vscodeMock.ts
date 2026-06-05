import Module = require('module');

const originalLoad = (Module as any)._load;

(Module as any)._load = function mockVscode(request: string, parent: unknown, isMain: boolean) {
	if (request !== 'vscode') {
		return originalLoad.apply(this, arguments as any);
	}

	const noopDisposable = { dispose: () => undefined };
	const configuration = {
		get: (_key: string, fallback: unknown) => fallback,
	};

	return {
		commands: {
			executeCommand: async () => undefined,
			registerCommand: () => noopDisposable,
		},
		env: {
			clipboard: { writeText: async () => undefined },
		},
		RelativePattern: class RelativePattern {
			constructor(public base: string, public pattern: string) {}
		},
		ViewColumn: { Beside: 2 },
		StatusBarAlignment: { Left: 1 },
		window: {
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
		},
		workspace: {
			createFileSystemWatcher: () => ({
				onDidChange: () => noopDisposable,
				onDidCreate: () => noopDisposable,
				onDidDelete: () => noopDisposable,
				dispose: () => undefined,
			}),
			getConfiguration: () => configuration,
			openTextDocument: async () => ({}),
			workspaceFolders: [],
		},
		Uri: {},
	};
};
