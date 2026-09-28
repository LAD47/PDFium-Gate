'use strict';

const MAIN_BRIDGE_FEATURE_CLASSES = Object.freeze({
  kernel: MainBridgeKernelFeature,
  identityLocator: MainBridgeIdentityLocatorFeature,
  contextMenu: MainBridgeContextMenuFeature,
  selectionCapture: MainBridgeSelectionCaptureFeature,
  selectionOperations: MainBridgeSelectionOperationsFeature,
  inputRouter: MainBridgeInputRouterFeature,
  wrapperLifecycle: MainBridgeWrapperLifecycleFeature,
  lifecycle: MainBridgeLifecycleFeature,
  emailImport: MainBridgeEmailImportFeature
});

function createBoundMainBridgePorts(host) {
  const ports = Object.create(null);
  const owners = Object.create(null);
  for (const [featureId, featureClass] of Object.entries(MAIN_BRIDGE_FEATURE_CLASSES)) {
    for (const name of Object.getOwnPropertyNames(featureClass.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(featureClass.prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      if (ports[name]) throw new Error(`Duplicate Main Bridge port provider ${name}: ${owners[name]} / ${featureId}`);
      ports[name] = descriptor.value.bind(host);
      owners[name] = featureId;
    }
  }
  for (const [featureId, contract] of Object.entries(MAIN_BRIDGE_FEATURE_CONTRACTS)) {
    for (const port of contract.ports || []) {
      if (typeof ports[port] !== 'function') throw new Error(`Unknown Main Bridge port ${featureId} -> ${port}`);
    }
  }
  return Object.freeze(ports);
}

class MainBridgeRuntime {
  constructor() {
    this.ports = createBoundMainBridgePorts(this);

    this.state = this.ports.freshState();
    this.runtime = {
      lifecycle:{webContentsCreatedHandler:null},
      contextMenu:{listeners:new Map(),filteredListeners:new Map(),newListenerWatchers:new Map()},
      shortcuts:{triggerCounter:0},
      wrapperRuntime:{pollers:new Map(),frameLifecycleListeners:new Map(),registrationInFlight:new Map()},
      keyboard:{
        inputListeners:new Map(),
        syntheticCtrlCUntil:0,
        routeDedupe:new Map(),
        selection:null,
        selectionRouteChain:Promise.resolve(),
        nativeMouseCopyRouteInFlight:false,
        nativeClearInputProbe:null,
        selectionMouseClearInFlight:false
      },
      targets:{activePdfTargetAdapter:null,embeddedPdfTargetCache:new Map()}
    };

    this.chromiumPdfRuntimeDriver = createChromiumPdfRuntimeDriver();
    this.rendererEventDispatchAdapter = createRendererEventDispatchAdapter({validateDetail:validateRendererBridgeEventDetail});
    this.emailImportMainProcessAdapter = createEmailImportMainProcessAdapter({
      app,
      BrowserWindow,
      dialog,
      shell,
      webContents,
      rendererEventDispatchAdapter:this.rendererEventDispatchAdapter,
      parseRetainedSourceLink:parseEmailImportRetainedSourcePdfLink,
      normalizeRetainedSourceTarget:normalizeEmailImportRetainedSourceTarget,
      retainedSourceEventName:RENDERER_BRIDGE_EVENTS.EMAIL_RETAINED_SOURCE_OPEN,
      resolvePdfContext:({ownerWc,details})=>{
        let token=null;
        for(const frame of [details?.initiator,details?.frame]) {
          token=pdfTokenFromWrapperFrameUrl(String(frame?.url || ''));
          if(token) break;
        }
        if(!token) {
          const tokens=new Set();
          for(const frame of this.ports.listFrameSubtree(ownerWc) || []) {
            const candidate=pdfTokenFromWrapperFrameUrl(this.ports.safeFrameUrl(frame));
            if(candidate) tokens.add(candidate);
          }
          if(tokens.size===1) token=tokens.values().next().value;
        }
        if(!token) return null;
        const publication=this.runtime.targets.activePdfTargetAdapter?.getPublication?.() || null;
        const filePath=publication?.known && publication?.token===token ? String(publication.filePath || '').trim() : '';
        return filePath ? {token,filePath} : null;
      }
    });

    this.embeddedPdfTargetAdapter = createEmbeddedPdfTargetAdapter({
      webContents,
      listFrameSubtree:this.ports.listFrameSubtree,
      pdfTokenFromWrapperFrameUrl,
      createEmbeddedPdfTarget:this.ports.createEmbeddedPdfTarget,
      onResolved:this.ports.recordEmbeddedPdfTargetResolution
    });
    this.runtime.targets.activePdfTargetAdapter = createActivePdfTargetAdapter({
      resolveExactPdf:this.ports.resolveEmbeddedPdfTargetExact,
      getFocusedWebContents:()=>webContents.getFocusedWebContents(),
      focusMatchesToken:this.ports.webContentsFocusMatchesPdfToken,
      focusedPdfToken:this.ports.focusedPdfTokenForWebContents
    });

    this.pdfIframeAdapter = createPdfIframeAdapter();
    this.pdfWrapperFrameAdapter = createPdfWrapperFrameAdapter({listFrameSubtree:this.ports.listFrameSubtree});
    this.browserWindowAdapter = createBrowserWindowAdapter({BrowserWindow});
    this.screenPointAdapter = createScreenPointAdapter({screen});
    this.obsidianCommandDispatchAdapter = createObsidianCommandDispatchAdapter({rendererEventDispatchAdapter:this.rendererEventDispatchAdapter});
  }
}

const mainBridgeRuntime = new MainBridgeRuntime();

function installMainBridgeWithEmailImportRouting(...args) {
  const result = mainBridgeRuntime.ports.install(...args);
  if (result?.installed === true) mainBridgeRuntime.emailImportMainProcessAdapter.installRetainedSourceRouting();
  return result;
}

function uninstallMainBridgeWithEmailImportRouting(...args) {
  try {
    return mainBridgeRuntime.ports.uninstall(...args);
  } finally {
    mainBridgeRuntime.emailImportMainProcessAdapter.uninstallRetainedSourceRouting();
  }
}

module.exports = {
  install: installMainBridgeWithEmailImportRouting,
  uninstall: uninstallMainBridgeWithEmailImportRouting,
  getState: mainBridgeRuntime.ports.getState,
  getPlatformCapabilities: mainBridgeRuntime.ports.getPlatformCapabilities,
  setRendererMenuOpen: mainBridgeRuntime.ports.setRendererMenuOpen,
  setKeyboardSelection: mainBridgeRuntime.ports.setKeyboardSelection,
  clearKeyboardSelection: mainBridgeRuntime.ports.clearKeyboardSelection,
  reportKeyboardSelectionResult: mainBridgeRuntime.ports.reportKeyboardSelectionResult,
  showLinkLocator: mainBridgeRuntime.ports.showLinkLocator,
  setActivePdfIdentity: mainBridgeRuntime.ports.setActivePdfIdentity,
  focusPdfRuntime: mainBridgeRuntime.ports.focusPdfRuntime,
  ensurePdfRuntime: mainBridgeRuntime.ports.ensurePdfRuntime,
  setIncludeHeaderFooterText: mainBridgeRuntime.ports.setIncludeHeaderFooterText,
  chooseEmailImportSource: mainBridgeRuntime.ports.chooseEmailImportSource,
  printControlledEmailHtmlToPdf: mainBridgeRuntime.ports.printControlledEmailHtmlToPdf,
  openRetainedEmailSource: mainBridgeRuntime.ports.openRetainedEmailSource
};
