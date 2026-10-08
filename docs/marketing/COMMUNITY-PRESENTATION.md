# PDFium Gate — Community presentation and launch copy

This file contains reusable public-facing copy for PDFium Gate. It is intentionally separate from technical release evidence and architecture documentation.

## Short Community pitch

**Turn PDFs, email, and archives into a traceable source library inside Obsidian.**

PDFium Gate combines PDF reading and annotation with exact source links, structured Markdown/YAML metadata, a sortable document register, EML/MSG email import, and safe ZIP/archive handling.

Use it when the PDF is not just something you read once, but part of a document collection you need to search, classify, cite, revisit, and preserve.

### Key benefits

- Read, select, highlight, and link back to exact PDF pages and selections.
- Edit structured metadata beside the document while you work.
- Sort, filter, and maintain large PDF collections in a document register.
- Import EML/MSG email as PDF with attachments and provenance.
- Import ZIP archives while preserving document relationships.
- Keep PDFs as normal files and durable metadata as ordinary Markdown/YAML.

Built for research, journalism and investigations, public records, administration, source collections, and long-term archives.

---

## 0.1.227 — What's new

### A clearer way to manage document collections

PDFium Gate 0.1.227 focuses on making document-heavy work easier to understand and safer to maintain.

The **PDF Document register** is now more practical for everyday use. PDFs are shown first, you can choose which metadata columns to display, and quick views make it easy to switch between **Active**, **Missing**, **Errors**, **Unregistered**, and **All** documents.

Unregistered PDFs can now be registered in bulk with **Register all**. Invalid or duplicate metadata records are easier to diagnose, and duplicate metadata can be removed through a guarded flow that rechecks document identity before anything is deleted. The PDF itself is never deleted by that action.

### Better metadata editing

**Document information** now makes editing more convenient, with Edit/Save/Cancel actions available where you need them.

Factory metadata and category labels follow the selected interface language, while stable UUIDs, properties, machine values, and user-customized labels remain unchanged. This makes the interface multilingual without rewriting user-owned data.

### Easier settings and clearer examples

Settings are grouped into compact, collapsible sections, and the real production document register is more clearly separated from the optional learning/example package.

### Release-quality improvements

0.1.227 also includes Community-release cleanup:

- the generated runtime is below the 5 MB Community/Sync target;
- flagged CSS patterns have been removed;
- the release workflow verifies the frozen source before publishing;
- GitHub artifact attestations are created for the Community release assets;
- privileged desktop capabilities are documented transparently;
- the exact release candidate passed the Obsidian Community preview scan.

PDFium Gate remains pre-1.0 software, but its core PDF, metadata, document-register, email-import, and archive workflows are covered by repeated regression testing.

---

## Share & Showcase forum post

### Title

**PDFium Gate — turn PDFs, email, and archives into a traceable source library in Obsidian**

### Post

I built PDFium Gate for a problem that starts after you have more than a few PDFs.

Reading and highlighting a PDF is useful, but for research-heavy work I also want to know:

- Where did this quote come from?
- What kind of document is this?
- Who sent it, and when?
- Which documents belong together?
- Is this file already registered?
- Can I find it again six months from now?
- Will the metadata still make sense if I stop using the plugin?

PDFium Gate tries to make the PDF the **source of record**, with Obsidian as the workspace around it.

With the plugin you can:

- read and annotate PDFs inside Obsidian;
- select text with mouse or keyboard;
- copy quotes and create links back to exact PDF pages/selections;
- add structured metadata beside the PDF through **Document information**;
- manage large collections through a sortable/filterable **PDF Document register**;
- import EML/MSG email as PDF with attachments and source provenance;
- import ZIP archives while preserving relationships between documents;
- keep durable metadata in ordinary Markdown/YAML instead of a proprietary database.

The document register is one of the parts I care most about. A PDF collection can be viewed as **Active**, **Missing**, **Errors**, **Unregistered**, or **All**, and metadata fields can be shown, hidden, filtered, and edited without leaving the register.

PDFium Gate is also deliberately conservative about document identity. Normal PDF rename/move operations preserve the document's UUID, while ambiguous or destructive situations fail safely rather than silently guessing.

The project is currently pre-1.0 and desktop-only. Most practical testing so far has been on Windows, and broader macOS/Linux testing is still needed.

The interface currently supports English, Norwegian Bokmål, German, Spanish, Swedish, Danish, and French.

I think the plugin is especially relevant for:

- journalism and investigations;
- academic/research source collections;
- public-record and administrative work;
- legal/document-heavy workflows;
- long-term personal or institutional archives.

The project is available through Obsidian Community Plugins as **PDFium Gate**.

Feedback is very welcome — especially from people who already manage large collections of PDFs or use Obsidian as a research/documentation workspace.

### Suggested screenshot positions

1. After the first paragraph: PDF open with **Document information** visible.
2. After the feature list: **PDF Document register** with several metadata columns and a filter.
3. After the paragraph about document identity: duplicate/error diagnostics or the Missing/Unregistered views.
4. Near the end: imported email PDF with attachment relationships.

---

## Short announcement version

**PDFium Gate turns PDFs, email, and ZIP archives into a traceable source library inside Obsidian.**

Read and annotate PDFs, create links back to exact source locations, add structured Markdown/YAML metadata, organize large collections in a document register, and import EML/MSG email and archives while preserving provenance.

Designed for research, journalism, public records, document-heavy administration, and long-term source collections.

Available through Obsidian Community Plugins.
