'use strict';

class MainBridgeEmailImportFeature {
  async chooseEmailImportSource(options = {}) {
    const __bridgeRuntime = this;
    return await __bridgeRuntime.emailImportMainProcessAdapter.chooseSource(options);
  }

  async printControlledEmailHtmlToPdf(options = {}) {
    const __bridgeRuntime = this;
    return await __bridgeRuntime.emailImportMainProcessAdapter.printControlledHtmlToPdf(options);
  }

  async openRetainedEmailSource(options = {}) {
    const __bridgeRuntime = this;
    return await __bridgeRuntime.emailImportMainProcessAdapter.openRetainedSource(options);
  }
}

module.exports = { MainBridgeEmailImportFeature };
