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

// import * as xml from 'xml-stream'
// import * as xmldom from 'xmldom'
import * as rrd from 'recursive-readdir';
import * as fs from 'fs';
import * as path from 'path';
import * as vscodels from 'vscode-languageserver';
var xmllint: xmllint = require('xmllint');
import * as enumerable from 'linq-es2015';
// var $ = require("jQuery");

// declare namespace xmllint {
// 	function validateXML(args: { xml: string | string[]; schema: string | string[]}): { error: null|string[]};
// }

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const xmlnamespaceregex = /xmlns:?(\w*?)\s*=\s*["'](.*?)["']/g;
const xmlschemadefinition = /targetNamespace\s*=\s*["'](.*?)["']/;

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
			textDocumentSync: documents.syncKind
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
	connection.console.log("Checking for new Schemas.\n");
	for(let source of schemalocations) {
		// Check if it is a uri
		if(source.startsWith("(http://|ftp://|file:///)")) {
			// TODO: Download schemas
		} else { // Check folders
			let folder;
			if(path.isAbsolute(source))
				folder = source;
			else
				folder = path.join(workspaceRoot, source);

			for(let file of findFilesSync(/\.xsd$/, folder)) {
				if(!findSchema(file))
					addNewSchema(file);
			}
		}
	}
}

function findSchema(file: string): string {
	connection.console.log("Looking for schema '" + file + "'\n")
	try {
		for(let value in schemauris) {
			if(schemauris[value].replace("file:///", "")===file)
				return file;
		}
		return null;
	} catch (error) {
		return null;
	}
}

function addNewSchema(file: string) {
	connection.console.log("Adding Schema '" + file + "'\n")
	let schemacontent = fs.readFileSync(file).toString();
	let name = schemacontent.match(xmlschemadefinition)[1];

	if(name)
		schemauris[name] = "file:///" + file;
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
let schemauris: { [namespace: string]: string} = { };
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	maxNumberOfProblems = settings.xml.maxNumberOfProblems || 100;
	schemalocations = settings.xml.schemalocations || ['.vscode/xmlschemas'];

	// Revalidate any open text documents
	checkForSchemaUpdates();
	documents.all().forEach((value, index, array)=>{validateTextDocument(value)});
});

function validateTextDocument(textDocument: TextDocument): void {
	connection.console.log("Validating document '" + textDocument.uri+"'\n")
	if(!textDocument)
		return;

	// Check finding diagnostic files.
	let diagnostics: Diagnostic[] = [];

	let content = textDocument.getText();
	let m;
	let usedschemas: { [id: string]: { range: vscodels.Range, uri: string} } = {};
	while((m = xmlnamespaceregex.exec(content))!=null) {
		let name = m[1]; let uri = m[2];
		let r = vscodels.Range.create(textDocument.positionAt(m.index), textDocument.positionAt(m.index + m[0].length));
		usedschemas[name] = { uri: uri, range: r };
	}
	connection.console.info("Found" + Object.keys(usedschemas).length + " schemas.");

	let probcntr = 0;
	for(let schema in usedschemas) {
		try {
			connection.console.info("Checking schema " + schema);
			let sf = schemauris[usedschemas[schema].uri]
			if(sf) {
				let diag = evaluateSchema({ xml: content, doc: textDocument }, { uri: schemauris[usedschemas[schema].uri], xsd: fs.readFileSync(schemauris[usedschemas[schema].uri].replace("file:///", "")).toString(), namespace: schema });
				diag.forEach((value, index, array) => {
					if(probcntr > maxNumberOfProblems)
						return;
					if(probcntr + value.diagnostics.length > maxNumberOfProblems)
						value.diagnostics = value.diagnostics.slice(0, maxNumberOfProblems - probcntr);
					probcntr += value.diagnostics.length;
					connection.sendDiagnostics(value);
				});
			}
			else
				diagnostics.push({
					range: usedschemas[schema].range,
					message: "Could not find schema for uri '" + usedschemas[schema].uri + "'.\nMake sure your schema is located in '${workspaceRoot}/.vscode/xmlschemas'",
					source: "xmlLint",
					severity: vscodels.DiagnosticSeverity.Warning
				});
		} catch (error) {
			connection.console.error(error.toString() + "\n" + error.stack ? error.stack : "");
		}
	}

	connection.console.info("Having " + diagnostics.length + " error(s) with Schema uris.")

	if(diagnostics.length>0)
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });

	connection.console.info("Validated document successfully.")
}

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});

function evaluateSchema(xmlfile: { xml: string, doc: TextDocument }, schemafile: { xsd: string, uri: string, namespace: string}): vscodels.PublishDiagnosticsParams[] {
	
	let diagnostics: vscodels.PublishDiagnosticsParams[] = [];
	try {
		// let result = { errors: [] }
		let result = xmllint.validateXML({
			xml: [xmlfile.xml],
			schema: [schemafile.xsd]
		});
 		// console.log("result ", result);
		let diags: {diag:Diagnostic,type:string}[] = [];
		if(result.errors) {
			for(let error of result.errors)
				connection.console.log("Pushing result Nr. " + diags.push(getDiagnosticItem(error, xmlfile, schemafile)));
			let xmlerrors = enumerable.asEnumerable(diags).Where(x=> x.type == "xml").Select(x=> x.diag).ToArray();
			connection.console.info("Found "+ xmlerrors.length + " errors in xml file");
			if(xmlerrors.length>0)
				diagnostics.push({ uri: xmlfile.doc.uri, diagnostics: xmlerrors});
			// let xsderrors = enumerable.asEnumerable(diags).Where(x=> x.type == "xsd").Select(x=>x.diag).ToArray();
			// connection.console.info("Found "+ xsderrors.length+" errors in xsd file");
			// if(xsderrors.length>0)
			// 	diagnostics.push({ uri: schemafile.uri, diagnostics: xsderrors});
		}
	} catch (error) {
		connection.console.error(error.toString() + "\n" + error.stack ? error.stack : "");
	}
	return diagnostics;
}

function getDiagnosticItem(linterror: string, xmlfile: { xml: string, doc: TextDocument }, schemafile: { xsd: string, uri: string, namespace: string}): {diag: Diagnostic, type: string} {
	let errormsg = /file_0\.(xsd|xml):(\d*):(.*):(.*):\s*(.*)/.exec(linterror);
	// Group 1: extension, Group 2: Line, Group 3: type, Group 4: source, Group 5: Message
	if(errormsg) {
		if(errormsg[1] == "xsd") {
			return {diag: {
				message: errormsg[3] + ":" + errormsg[4] + ":" + errormsg[5],
				range: vscodels.Range.create({ line: Number(errormsg[2]), character: 1}, { line: Number(errormsg[2]), character: 2 }),
				source: schemafile.namespace,
				severity: vscodels.DiagnosticSeverity.Warning
			}, type: "xsd"}
		} else {
			let offset = xmlfile.doc.offsetAt({ character: 1, line: Number(errormsg[2])})
			let startchar = xmlfile.xml.indexOf(errormsg[4].trim(), offset) - offset;
			let range = vscodels.Range.create({line:Number(errormsg[2]), character:startchar}, {line:Number(errormsg[2]),character:startchar+errormsg[4].trim().length})
			return { diag: {
				message: errormsg[3],
				range: vscodels.Range.create({ line: Number(errormsg[2]), character: 1}, { line: Number(errormsg[2]), character: 2 }),
				source: schemafile.namespace,
				severity: getSeverity(errormsg[3])
			}, type: "xml" }
		}
	}
	return { diag: { 
			message: "linterror",
			range: vscodels.Range.create({ line: 1, character: 1}, { line: 1, character: 2}),
			source: "unknown"
		}, type: "unknown" }
}

function getSeverity(msg: string): vscodels.DiagnosticSeverity {
	if(msg.indexOf("warning")) {
		return vscodels.DiagnosticSeverity.Warning;
	} else if (msg.indexOf("error")) {
		return vscodels.DiagnosticSeverity.Error;
	} else
		return vscodels.DiagnosticSeverity.Information;
}

// Listen on the connection
connection.listen();