/**
 * HTML para las ventanas de impresión (tickets y cierre de caja).
 *
 * Esas ventanas comparten el origen de la app: un nombre de producto como `<img src=x onerror=...>`
 * escrito tal cual ejecutaría código con la sesión del cajero. Por eso el HTML se arma con el
 * template `html`, que escapa TODO lo que se interpola salvo otro fragmento ya armado con `html`.
 */

/** Fragmento de HTML ya escapado: se puede interpolar dentro de otro `html` sin volver a escaparlo. */
export class HtmlSeguro {
  constructor(readonly valor: string) {}
  toString() {
    return this.valor;
  }
}

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escaparHtml(valor: unknown): string {
  return String(valor).replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

function aHtml(valor: unknown): string {
  if (valor instanceof HtmlSeguro) return valor.valor;
  if (Array.isArray(valor)) return valor.map(aHtml).join('');
  // Permite `${condicion && html`...`}` y campos opcionales ausentes sin imprimir "false" ni "undefined".
  if (valor === null || valor === undefined || valor === false) return '';
  return escaparHtml(valor);
}

export function html(partes: TemplateStringsArray, ...valores: unknown[]): HtmlSeguro {
  let resultado = partes[0];
  valores.forEach((valor, i) => {
    resultado += aHtml(valor) + partes[i + 1];
  });
  return new HtmlSeguro(resultado);
}

// Segunda barrera: aunque algo se escapara mal, la ventana no ejecuta scripts ni carga recursos.
const CSP = "default-src 'none'; style-src 'unsafe-inline'";

/** Documento completo para imprimir. `estilos` debe ser una constante del código, nunca datos. */
export function documentoImpresion(titulo: string, estilos: string, cuerpo: HtmlSeguro): string {
  return html`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${titulo}</title><style>${new HtmlSeguro(estilos)}</style></head><body>${cuerpo}</body></html>`.valor;
}

/** Abre la ventana de impresión con el documento y lanza el diálogo de imprimir. */
export function imprimir(documento: string) {
  const w = window.open('', '_blank', 'width=320,height=600');
  if (!w) return;
  w.document.write(documento);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
