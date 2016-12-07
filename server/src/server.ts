/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind
} from 'vscode-languageserver';
import * as xmllint from 'xmllint';
import * as rrd from 'recursive-readdir';
import * as fs from 'fs';
import * as path from 'path';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true
			}
		}
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	checkForSchemaUpdates();
	validateTextDocument(change.document);
});

function checkForSchemaUpdates() {
	for(let source in schemalocations) {
		// Check if it is a uri
		if(source.startsWith("(http://|ftp://|file:///)")) {
			// TODO: Download schemas
		} else { // Check folders
			let folder;
			if(!path.isAbsolute(source))
				folder = source;
			else
				folder = path.join(workspaceRoot, source);
			
			for(let file in findFilesSync(/\.xsd$/, folder)) {
				if(!schemauris.find((value, index, obj) => { return value === file; }))
					addNewSchema(file);
			}
		}
	}
}

function addNewSchema(file: string) {
	schemauris.push("file:///" + file);
}

function findSync(pattern, startdir, ignore) {
	startdir = startdir ? startdir : workspaceRoot;
	let regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
	return this.findFilesSync(regex, startdir, ignore);
}

function findFilesSync(pattern: RegExp, startdir: string, ignore?: string[]) {
	let results = [];
	let list = fs.readdirSync(startdir);
	for (let file of list) {
		file = startdir + '\\' + file;
		var stat = fs.statSync(file);
		if (stat && stat.isDirectory()) {
			let base = path.basename(file);
			if (!ignore.find((value, index, obj) => {
				let fpaths = value.split('/');
				if (fpaths[0] == base) {
					if (fpaths.length > 1)
						this.findFilesSync(pattern, path.join(startdir, fpaths[0]), [fpaths.splice(0, 1).join("/")]);
					else
						return true;
				}
				else
					return false;
			}))
				results = results.concat(this.findFilesSync(pattern, file, ignore));
		}
		else if (file.match(pattern))
			results.push(file);
	}
	return results;
}

// The settings interface describe the server relevant settings part
interface Settings {
	xml: ExampleSettings;
}

// These are the example settings we defined in the client's package.json
// file
interface ExampleSettings {
	maxNumberOfProblems: number;
	schemalocations: string[];
}

// hold the maxNumberOfProblems setting
let maxNumberOfProblems: number;
let schemalocations: string[];

// Actual schema locations
let schemauris: string[];
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	maxNumberOfProblems = settings.xml.maxNumberOfProblems || 100;
	schemalocations = settings.xml.schemalocations || ['.vscode/xmlschemas'];
	
	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
});

function validateTextDocument(textDocument: TextDocument): void {
	let diagnostics: Diagnostic[] = [];
	
	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have change in VSCode
	connection.console.log('We recevied an file change event');
});


// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in 
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	return [
		{
			label: 'TypeScript',
			kind: CompletionItemKind.Text,
			data: 1
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2
		}
	]
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = 'TypeScript details',
		item.documentation = 'TypeScript documentation'
	} else if (item.data === 2) {
		item.detail = 'JavaScript details',
		item.documentation = 'JavaScript documentation'
	}
	return item;
});

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    let diagnostics: Diagnostic[] = [];
	console.log("TESTESTESTEST");
	connection.console.log("HEllo, Running all superly");
    let lines = change.document.getText().split(/\r?\n/g);
    lines.forEach((line, i) => {
        let index = line.indexOf('typescript');
        if (index >= 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: i, character: index},
                    end: { line: i, character: index + 10 }
                },
                message: `${line.substr(index, 10)} should be spelled TypeScript`,
                source: 'ex'
            });
        }
    })
    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});
