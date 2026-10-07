import { describe, expect, it } from 'vitest';
import { documentoImpresion, escaparHtml, html, HtmlSeguro } from './html';

describe('escaparHtml', () => {
  it('escapa los cinco caracteres especiales', () => {
    expect(escaparHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('convierte números a texto', () => {
    expect(escaparHtml(1500)).toBe('1500');
  });
});

describe('html', () => {
  it('escapa lo que se interpola, no el HTML escrito en el template', () => {
    const nombre = '<img src=x onerror=alert(1)>';
    expect(html`<td>${nombre}</td>`.valor).toBe('<td>&lt;img src=x onerror=alert(1)&gt;</td>');
  });

  it('no vuelve a escapar un fragmento armado con html', () => {
    const fila = html`<tr><td>${'a & b'}</td></tr>`;
    expect(html`<table>${fila}</table>`.valor).toBe('<table><tr><td>a &amp; b</td></tr></table>');
  });

  it('une listas de fragmentos y escapa las que traen texto', () => {
    const filas = ['<b>', 'ok'].map((t) => html`<li>${t}</li>`);
    expect(html`<ul>${filas}</ul>`.valor).toBe('<ul><li>&lt;b&gt;</li><li>ok</li></ul>');
    expect(html`${['<x>']}`.valor).toBe('&lt;x&gt;');
  });

  it('omite false, null y undefined (condiciones y campos opcionales)', () => {
    const mostrar = false;
    expect(html`a${mostrar && html`<b>`}${null}${undefined}b`.valor).toBe('ab');
  });

  it('imprime el 0 (por ejemplo, una propina de $0)', () => {
    expect(html`${0}`.valor).toBe('0');
  });

  it('un objeto que solo imita HtmlSeguro no se toma como seguro', () => {
    const falso = { valor: '<script>' } as unknown as HtmlSeguro;
    expect(html`${falso}`.valor).toBe('[object Object]');
  });
});

describe('documentoImpresion', () => {
  it('bloquea scripts con CSP y escapa el título', () => {
    const doc = documentoImpresion('<Ticket>', 'body{margin:0}', html`<p>${'<script>alert(1)</script>'}</p>`);
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">`);
    expect(doc).toContain('<title>&lt;Ticket&gt;</title>');
    expect(doc).toContain('<style>body{margin:0}</style>');
    expect(doc).toContain('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(doc).not.toContain('<script>');
  });
});
