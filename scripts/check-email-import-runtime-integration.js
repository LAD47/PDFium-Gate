#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
function read(name){ return fs.readFileSync(path.join(ROOT,name),'utf8'); }
function fail(message){ throw new Error(message); }
function requireMatch(source,pattern,label){ if(!pattern.test(source)) fail(`missing ${label}`); }
function forbidMatch(source,pattern,label){ if(pattern.test(source)) fail(`unexpected ${label}`); }

const main=read('main.js');
const bridge=read('main-bridge.js');

requireMatch(main,/const EMAIL_IMPORT_RUNTIME\s*=\s*\(\(\)\s*=>/,'bundled Email Import runtime');
requireMatch(main,/class EmailImportFeature\b/,'EmailImportFeature');
requireMatch(main,/id:\s*['"]import-email-source['"]/,'Email Import command');
requireMatch(main,/id:\s*['"]import-email-pdf-attachment['"]/,'Email PDF attachment import command');
requireMatch(main,/class EmailImportReviewModal\b/,'Email Import review modal');
requireMatch(main,/class EmailPdfAttachmentImportModal\b/,'Email PDF attachment import modal');
requireMatch(main,/readVerifiedRetainedSource/,'retained source reread verification');
requireMatch(main,/verifiedPdfAttachmentBytes/,'PDF attachment payload verification');
requireMatch(main,/buildEmailAttachmentImportRecordValues/,'PDF attachment provenance projection');
requireMatch(main,/email_import_attachment_parent_record_id/,'stable parent record relationship');
requireMatch(main,/chooseEmailImportSource/,'renderer-to-main source picker transport');
requireMatch(main,/printControlledEmailHtmlToPdf/,'renderer-to-main PDF printer transport');

forbidMatch(main,/require\(["']mailparser["']\)/,'runtime mailparser package require');
forbidMatch(main,/require\(["']sanitize-html["']\)/,'runtime sanitize-html package require');
forbidMatch(main,/require\(["']@kenjiuno\/msgreader["']\)/,'runtime msgreader package require');

requireMatch(bridge,/class MainBridgeEmailImportFeature\b/,'main-bridge Email Import feature');
requireMatch(bridge,/async chooseEmailImportSource\(/,'main-process source picker');
requireMatch(bridge,/async printControlledEmailHtmlToPdf\(/,'main-process controlled HTML PDF printer');
requireMatch(bridge,/javascript:false/,'printer JavaScript disablement');
requireMatch(bridge,/nodeIntegration:false/,'printer Node isolation');
requireMatch(bridge,/sandbox:true/,'printer sandbox');
requireMatch(bridge,/setWindowOpenHandler\(\(\)\s*=>\s*\(\{\s*action:['"]deny['"]/,'printer new-window denial');

console.log(JSON.stringify({
  ok:true,
  mainBytes:Buffer.byteLength(main),
  mainBridgeBytes:Buffer.byteLength(bridge),
  bundledDependencies:true,
  commandWired:true,
  attachmentImportWired:true,
  controlledPrinter:true
},null,2));
