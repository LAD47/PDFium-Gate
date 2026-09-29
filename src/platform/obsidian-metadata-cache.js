'use strict';
const OBSIDIAN_METADATA_CACHE_CONTRACT_VERSION='0.2';
function createObsidianMetadataCacheAdapter({metadataCache}) {
  function onResolved(callback) {
    if(!metadataCache || typeof metadataCache.on!=='function') throw new Error('metadataCache.on er ikke tilgjengelig');
    if(typeof callback!=='function') throw new Error('metadataCache resolved callback mangler');
    return metadataCache.on('resolved', callback);
  }
  function getFrontmatter(file) {
    if(!metadataCache || typeof metadataCache.getFileCache!=='function' || !file) return null;
    const cache=metadataCache.getFileCache(file);
    const frontmatter=cache?.frontmatter;
    return frontmatter && typeof frontmatter==='object' && !Array.isArray(frontmatter) ? frontmatter : null;
  }
  function resolveLinkPath(linkPath,sourcePath) {
    if(!metadataCache || typeof metadataCache.getFirstLinkpathDest!=='function') return null;
    const file=metadataCache.getFirstLinkpathDest(String(linkPath || ''),String(sourcePath || ''));
    return typeof file?.path==='string' ? file.path : null;
  }
  return Object.freeze({contractVersion:OBSIDIAN_METADATA_CACHE_CONTRACT_VERSION,onResolved,getFrontmatter,resolveLinkPath});
}
module.exports={OBSIDIAN_METADATA_CACHE_CONTRACT_VERSION,createObsidianMetadataCacheAdapter};
