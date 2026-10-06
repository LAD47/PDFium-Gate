'use strict';

async function installMetadataExampleFiles(read, write) {
  if (!read || !write) return {ok:false,error:'Vault adapters are unavailable.'};

  try {
    const rootEntry = read.getAbstractFileByPath(PDFIUM_EXAMPLES_ROOT);
    if (rootEntry && !Array.isArray(rootEntry.children)) {
      throw new Error(`${PDFIUM_EXAMPLES_ROOT} exists but is not a folder`);
    }
    if (!rootEntry) await write.ensureFolder(PDFIUM_EXAMPLES_ROOT);

    const created=[];
    const overwritten=[];
    const legacyRemoved=[];
    const legacyPreserved=[];
    const legacyPath=`${PDFIUM_EXAMPLES_ROOT}/Example PDF Document Register.base`;
    const legacy=read.getAbstractFileByPath(legacyPath);
    if(legacy && !Array.isArray(legacy.children)) {
      const current=String(await read.readText(legacy));
      if(current===metadataExampleLegacyNativeBaseYaml()) {
        await write.deleteFile(legacy,true);
        legacyRemoved.push(legacyPath);
      } else {
        legacyPreserved.push(legacyPath);
      }
    }

    for (const example of metadataExampleFiles()) {
      const existing = read.getAbstractFileByPath(example.path);
      if (existing && Array.isArray(existing.children)) {
        throw new Error(`${example.path} exists but is a folder`);
      }
      if (existing) {
        await write.modifyText(existing, example.content);
        overwritten.push(example.path);
      } else {
        await write.createText(example.path, example.content);
        created.push(example.path);
      }
    }
    return {
      ok:true,
      created,
      overwritten,
      legacyRemoved,
      legacyPreserved,
      total:created.length+overwritten.length
    };
  } catch (error) {
    const message=error instanceof Error ? error.message : String(error);
    return {ok:false,error:message};
  }
}
