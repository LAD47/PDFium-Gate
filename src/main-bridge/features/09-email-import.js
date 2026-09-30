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

  async resolveEmailAttachmentPdfPoint(input = {}) {
    const __bridgeRuntime = this;
    return await __bridgeRuntime.emailAttachmentPdfPointAdapter.resolve(input);
  }
}

module.exports = { MainBridgeEmailImportFeature };
