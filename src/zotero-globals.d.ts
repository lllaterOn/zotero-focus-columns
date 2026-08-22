declare const Zotero: any;
declare const Services: any;
declare const Components: any;
declare const ChromeUtils: any;
declare const IOUtils: any;
declare const PathUtils: any;

interface Window {
  MozXULElement?: {
    insertFTLIfNeeded(resource: string): void;
  };
  Zotero?: any;
}
