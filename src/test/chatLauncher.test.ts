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
	});
});
