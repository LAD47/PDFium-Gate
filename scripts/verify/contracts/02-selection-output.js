const fs=require('fs');
module.exports = function verifyContract(ctx){
const {fail,read,main,bridge,annotator}=ctx;

if(!main.includes('PDFiumGateTestPlugin')) fail('plugin class missing');
if(!bridge.includes('MainBridgeRuntime')) fail('main-bridge runtime missing');
if(!annotator.includes('pdfiumGateAnnotator')) fail('annotator runtime missing');

const relativeRequire = /require\s*\(\s*['"]\.\.?\//;
if(relativeRequire.test(main)) fail('main.js contains runtime-relative require');
if(relativeRequire.test(bridge)) fail('main-bridge.js contains runtime-relative require');

if(!main.includes('syncFocusRetestDiagnosticsPolling()')) fail('diagnostics polling lifecycle helper missing');
if(!main.includes('native-resolved-range-exact-geometry')) fail('native exact geometry handoff missing from generated main.js');
if(!annotator.includes('resolvedGeometry')) fail('annotator resolvedGeometry output missing');
if(!main.includes('forceResolveIdentity=options?.forceResolveIdentity === true')) fail('forced native identity resolution option missing');
if(!main.includes("resolveNativeIdentity = contextEvent?.selectionSource === 'native-context-selection'")) fail('context menu native identity gate missing');
if(!main.includes("filterApplied ? String(result?.filteredText||'') : rawText")) fail('header/footer ON must preserve raw outward text after identity analysis');
{
  const menuFn=read('src/plugin/features/05-context-menu.js');
  if(!menuFn.includes('async showPdfContextOverlayAsync(contextEvent)')) fail('context menu method missing');
  const direct=menuFn.indexOf('inspectDirectHighlightContextForMenu');
  const selection=menuFn.indexOf('inspectSelectionContextForMenu');
  if(direct<0||selection<0||direct>=selection) fail('existing-highlight-first menu priority contract missing');
}
if(!main.includes("const RUNTIME_COMPATIBILITY_CONTRACT_VERSION = '0.2'")) fail('runtime compatibility contract missing from generated main.js');
if(!main.includes("supportedObsidianVersion: '1.13.7'")) fail('supported Obsidian runtime missing');
if(!main.includes('supportedElectronMajor: 43')) fail('supported Electron runtime missing');
if(!main.includes("evaluateRuntimeCompatibilityGate('main-bridge-install', true)")) fail('runtime compatibility startup gate missing');
if(!main.includes('copy-runtime-compatibility-status')) fail('runtime compatibility diagnostic command missing');
if(!main.includes('runtimeCompatibility: this.state.diagnostics.runtimeCompatibility || null')) fail('runtime compatibility diagnostic export missing');
if(!main.includes("const MAIN_PROCESS_TRANSPORT_CONTRACT_VERSION = '0.3'")) fail('MainProcessTransport 0.3 contract missing from generated main.js');
if(!main.includes("'chooseEmailImportSource'")) fail('MainProcessTransport Email Import source-picker method missing');
if(!main.includes("'printControlledEmailHtmlToPdf'")) fail('MainProcessTransport Email Import PDF-printer method missing');
if(!main.includes('this.mainProcessTransport = createMainProcessTransport')) fail('MainProcessTransport composition binding missing');
if(main.includes('this.focusMainBridge =')) fail('raw Main Bridge module reference leaked back into renderer plugin');
if(main.includes('this.electronRemoteRequireAdapter.requireInMain(')) fail('renderer production code bypasses MainProcessTransport load boundary');
if(!main.includes("const PDF_BACKUP_DIR_NAME = '.pdfium-backup';")) fail('hidden .pdfium-backup routing constant missing');
if(main.includes("const PDF_BACKUP_DIR_NAME = '_pdfium-backup';")) fail('legacy visible _pdfium-backup routing is still active');
if(!main.includes('this.nodeFilesystemAdapter.statKind(backupDirFsPath)')) fail('hidden backup filesystem directory probe missing');
if(!main.includes('this.nodeFilesystemAdapter.copyFile(sourceFsPath, backupFsPath)')) fail('hidden backup filesystem copy missing');
if(main.includes('obsidianVaultWriteAdapter.createBinary(workTarget.backupPath, original)')) fail('hidden backup still writes through Vault createBinary');


};
