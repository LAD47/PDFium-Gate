'use strict';

async function installMetadataExampleFiles(read, write, schema = null) {
  if (!read || !write) return {ok:false,error:'Vault adapters are unavailable.'};

  try {
    const effectiveSchema=schema || metadataUpgradeAuthorSourceUrl(metadataDefaultSchema()).schema;
    const registerPath=PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH;
    const rootRegister=read.getAbstractFileByPath(registerPath);
    if(rootRegister && Array.isArray(rootRegister.children)) throw new Error(`${registerPath} exists but is a folder`);
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

    for (const example of metadataExampleFiles(effectiveSchema)) {
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
    // Create the root register only if missing; never replace a user-owned Base.
    const existingRegister=read.getAbstractFileByPath(registerPath);
    let registerCreated=false;
    if(!existingRegister) {
      const createdFile=await write.createText(registerPath,metadataDocumentRegisterStandardBaseYaml(effectiveSchema));
      if(!createdFile || String(createdFile.path || '')!==registerPath) throw new Error(`Register creation read-back failed: ${registerPath}`);
      registerCreated=true;
    }
    return {
      ok:true,
      registerCreated,
      registerPreserved:!registerCreated,
      registerPath,
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
