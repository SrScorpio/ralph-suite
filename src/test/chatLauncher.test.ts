import * as assert from 'assert';
import * as vscode from 'vscode';
import { sendToChat } from '../chatLauncher';

describe('chatLauncher', () => {
	describe('sendToChat', () => {
		it('returns true when the chat command succeeds', async () => {
			const result = await sendToChat('Hello world');
			assert.strictEqual(result, true);
		});

		it('calls the workbench.action.chat.open command', async () => {
			let calledCommand: string | undefined;
			let calledArgs: unknown;
			const origExec = vscode.commands.executeCommand;
			(vscode.commands as any).executeCommand = async (cmd: string, ...args: unknown[]) => {
				calledCommand = cmd;
				calledArgs = args[0];
			};
			try {
				await sendToChat('Test prompt');
			} finally {
				(vscode.commands as any).executeCommand = origExec;
			}
			assert.strictEqual(calledCommand, 'workbench.action.chat.open');
			assert.deepStrictEqual(calledArgs, { query: 'Test prompt', isPartialQuery: false });
		});

		it('calls newChat first when freshContext is true', async () => {
			const commandsCalled: string[] = [];
			const origExec = vscode.commands.executeCommand;
			(vscode.commands as any).executeCommand = async (cmd: string) => {
				commandsCalled.push(cmd);
			};
			try {
				await sendToChat('Fresh', { freshContext: true, delayMs: 0 });
			} finally {
				(vscode.commands as any).executeCommand = origExec;
			}
			assert.strictEqual(commandsCalled[0], 'workbench.action.chat.newChat');
			assert.strictEqual(commandsCalled[1], 'workbench.action.chat.open');
		});

		it('falls back to clipboard and returns false when chat command throws', async () => {
			const origExec = vscode.commands.executeCommand;
			(vscode.commands as any).executeCommand = async () => { throw new Error('chat unavailable'); };
			let clipboardWritten: string | undefined;
			const origWrite = vscode.env.clipboard.writeText;
			(vscode.env.clipboard as any).writeText = async (text: string) => { clipboardWritten = text; };
			try {
				const result = await sendToChat('Fallback test', { delayMs: 0 });
				assert.strictEqual(result, false);
				assert.strictEqual(clipboardWritten, 'Fallback test');
			} finally {
				(vscode.commands as any).executeCommand = origExec;
				(vscode.env.clipboard as any).writeText = origWrite;
			}
		});

		it('does not call newChat when freshContext is false', async () => {
			const commandsCalled: string[] = [];
			const origExec = (vscode.commands as any).executeCommand;
			(vscode.commands as any).executeCommand = async (cmd: string) => {
				commandsCalled.push(cmd);
			};
			try {
				await sendToChat('No fresh', { freshContext: false });
			} finally {
				(vscode.commands as any).executeCommand = origExec;
			}
			// freshContext false → only chat.open, no newChat
			assert.ok(!commandsCalled.includes('workbench.action.chat.newChat'), 'should not call newChat');
			assert.ok(commandsCalled.includes('workbench.action.chat.open'), 'should call chat.open');
		});

		it('returns false when chat.open exceeds the timeout', async () => {
			const origExec = vscode.commands.executeCommand;
			const origWrite = vscode.env.clipboard.writeText;
			(vscode.commands as any).executeCommand = async () => new Promise(() => undefined);
			(vscode.env.clipboard as any).writeText = async () => undefined;
			try {
				const started = Date.now();
				const result = await sendToChat('Timeout test', { timeoutMs: 10 });
				assert.strictEqual(result, false);
				assert.ok(Date.now() - started < 500);
			} finally {
				(vscode.commands as any).executeCommand = origExec;
				(vscode.env.clipboard as any).writeText = origWrite;
			}
		});

		it('removes the abort listener after a timeout', async () => {
			const origExec = vscode.commands.executeCommand;
			const origWrite = vscode.env.clipboard.writeText;
			const listeners: EventListener[] = [];
			const signal = {
				aborted: false,
				addEventListener: (_type: string, listener: EventListener) => { listeners.push(listener); },
				removeEventListener: (_type: string, listener: EventListener) => {
					const index = listeners.indexOf(listener);
					if (index >= 0) { listeners.splice(index, 1); }
				},
			} as unknown as AbortSignal;
			(vscode.commands as any).executeCommand = async () => new Promise(() => undefined);
			(vscode.env.clipboard as any).writeText = async () => undefined;
			try {
				await sendToChat('Listener cleanup', { timeoutMs: 10, signal });
				assert.strictEqual(listeners.length, 0);
			} finally {
				(vscode.commands as any).executeCommand = origExec;
				(vscode.env.clipboard as any).writeText = origWrite;
			}
		});

		it('does not open chat when the signal is already aborted', async () => {
			const controller = new AbortController();
			controller.abort();
			const origExec = vscode.commands.executeCommand;
			let opened = false;
			(vscode.commands as any).executeCommand = async (command: string) => {
				if (command === 'workbench.action.chat.open') { opened = true; }
			};
			try {
				const result = await sendToChat('Pre-aborted prompt', { signal: controller.signal });
				assert.strictEqual(result, false);
				assert.strictEqual(opened, false);
			} finally {
				(vscode.commands as any).executeCommand = origExec;
			}
		});
	});
});
