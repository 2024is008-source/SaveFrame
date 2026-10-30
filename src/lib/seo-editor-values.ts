export interface SeoFields {
  title?: string; description?: string; targetKeyword?: string;
  ogTitle?: string; ogDescription?: string; image?: string; contentDescription?: string;
}
// Written only by the server. Distinguishes deliberate edits from shipped old defaults.
export const seoEditorVersionKey = '__saveframeSeoEditorVersion';
export function isExplicitSeoEdit(value: Record<string, unknown>): boolean { return value[seoEditorVersionKey] === 1; }
export function defaultSeoFields(page: {title: string; description: string; keyword?: string; image?: string}): Record<string, string> {
  return {title: page.title, description: page.description, targetKeyword: page.keyword || '', ogTitle: '', ogDescription: '', image: page.image || '', contentDescription: ''};
}

/** Linked fields follow primary edits; deliberately different copy stays independent. */
export function changeSeoField(values: Record<string, string>, key: string, input: string, contentEditable: boolean) {
  const value = ['title', 'ogTitle'].includes(key) ? input.replace(/[\r\n]+/g, ' ') : input;
  const next = {...values, [key]: value};
  if (key === 'title' && (!values.ogTitle || values.ogTitle === values.title)) next.ogTitle = '';
  if (key === 'description') {
    if (!values.ogDescription || values.ogDescription === values.description) next.ogDescription = '';
    if (contentEditable && values.contentDescription === values.description) next.contentDescription = '';
  }
  return next;
}
