/**
 * DISCOVERY SPEC — not a regression test.
 * Logs in, navigates to a workflow (default: Purchase Order Search), and dumps
 * every form control inside the rcp_content frame: id, name, tag, type, widget
 * class (eto-*), associated label, section heading, options (for selects),
 * value/checked state, and visibility.
 *
 * Run with:  FORM_DISCOVERY=1  (gated, like _menu-discovery)
 *   $env:FORM_DISCOVERY="1"; npx playwright test _form-discovery --project=chromium --headed
 *
 * Output: console + form-map-po-search.json in the harness root.
 */
import { test } from '@playwright/test';
import { loginAsSuper, navigateToMenuItem, getRcpFrame } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

test.setTimeout(240_000);

const OUT_FILE = path.join(__dirname, '..', 'form-map-po-search.json');

test('discover Purchase Order Search form controls', async ({ page }) => {
  test.skip(!process.env.FORM_DISCOVERY, 'Maintenance tool — run with FORM_DISCOVERY=1');

  await loginAsSuper(page);
  await page.waitForTimeout(3000);
  await navigateToMenuItem(page, 'Order Management', 'Purchase Order', 'Search');

  const frame = await getRcpFrame(page);
  // Let the search form finish rendering (Order Type combobox is a good sentinel,
  // but don't fail discovery if it's absent — just wait generously).
  await frame
    .locator('input, select, textarea')
    .first()
    .waitFor({ state: 'attached', timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(3000);

  // getRcpFrame returns a FrameLocator — evaluate via an element handle on <body>.
  const dump = await frame.locator('body').evaluate((bodyEl) => {
    const document = bodyEl.ownerDocument;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const labelFor = (el: Element): string | null => {
      const id = el.getAttribute('id');
      if (id) {
        // CSS.escape for ids containing dots like PoRequestSchedule.PdfString19
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab?.textContent?.trim()) return lab.textContent.trim();
      }
      // aria-label wins next
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      // otherwise nearest widget container's own <label>
      const container = el.closest('[class*="eto-"]');
      const lab = container?.querySelector(':scope label, :scope > * > label');
      return lab?.textContent?.trim() ?? null;
    };

    const sectionFor = (el: Element): string | null => {
      // Walk up looking for the enclosing expand section and read its h3
      let node: Element | null = el;
      while (node) {
        const sec = node.closest('.eto-expand, section, fieldset');
        if (!sec) break;
        const h = sec.querySelector('h3, h2, legend');
        if (h?.textContent?.trim()) return h.textContent.trim();
        node = sec.parentElement;
      }
      return null;
    };

    const widgetFor = (el: Element): { widgetClass: string | null; widgetId: string | null } => {
      const container = el.closest('[class*="eto-"]:not(label):not(button)');
      if (!container) return { widgetClass: null, widgetId: null };
      const cls = Array.from(container.classList).filter((c) => c.startsWith('eto-'));
      return { widgetClass: cls.join(' ') || null, widgetId: container.getAttribute('id') };
    };

    const controls: any[] = [];
    document.querySelectorAll('input, select, textarea, button').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type');
      // Skip pure layout noise
      if (tag === 'input' && type === 'hidden') {
        controls.push({
          tag, type,
          id: el.getAttribute('id'),
          name: el.getAttribute('name'),
          value: (el as HTMLInputElement).value?.slice(0, 120) ?? null,
          hiddenInput: true,
        });
        return;
      }

      const entry: any = {
        tag,
        type: type ?? (tag === 'select' ? ((el as HTMLSelectElement).multiple ? 'select-multiple' : 'select-one') : null),
        id: el.getAttribute('id'),
        name: el.getAttribute('name'),
        label: labelFor(el),
        section: sectionFor(el),
        visible: visible(el),
        ...widgetFor(el),
      };

      if (tag === 'select') {
        const sel = el as HTMLSelectElement;
        entry.options = Array.from(sel.options).map((o) => ({
          value: o.value,
          text: (o.textContent ?? '').trim(),
          selected: o.selected,
        }));
      } else if (tag === 'input') {
        const inp = el as HTMLInputElement;
        if (type === 'checkbox' || type === 'radio') entry.checked = inp.checked;
        else entry.value = inp.value?.slice(0, 120) ?? null;
        if (inp.placeholder) entry.placeholder = inp.placeholder;
      } else if (tag === 'textarea') {
        entry.value = (el as HTMLTextAreaElement).value?.slice(0, 120) ?? null;
      } else if (tag === 'button') {
        entry.text = (el.textContent ?? '').trim().slice(0, 80);
        // buttons without text or with icon glyphs only are still useful (expand_more etc.)
      }

      controls.push(entry);
    });

    // Also dump the eto widget containers themselves (combobox/datepicker/etc.)
    const widgets: any[] = [];
    document
      .querySelectorAll('[class*="eto-complex-combobox"], [class*="eto-combobox"], [class*="eto-datepicker"], [class*="eto-checkbox"], [class*="eto-radio"], [class*="eto-autocomplete"]')
      .forEach((el) => {
        // top-level widget containers only (skip nested sub-elements)
        const parentWidget = el.parentElement?.closest(
          '[class*="eto-complex-combobox"], [class*="eto-combobox"], [class*="eto-datepicker"], [class*="eto-autocomplete"]'
        );
        if (parentWidget) return;
        const cls = Array.from(el.classList).filter((c) => c.startsWith('eto-'));
        widgets.push({
          id: el.getAttribute('id'),
          widgetClass: cls.join(' '),
          label: el.querySelector(':scope label')?.textContent?.trim() ?? null,
          visible: visible(el),
          innerSelect: el.querySelector('select')
            ? {
                name: el.querySelector('select')!.getAttribute('name'),
                multiple: (el.querySelector('select') as HTMLSelectElement).multiple,
                options: Array.from((el.querySelector('select') as HTMLSelectElement).options).map((o) => ({
                  value: o.value,
                  text: (o.textContent ?? '').trim(),
                  selected: o.selected,
                })),
              }
            : null,
        });
      });

    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
      tag: h.tagName.toLowerCase(),
      cls: h.className,
      text: (h.textContent ?? '').trim(),
    }));

    return { url: location.href, headings, widgets, controls };
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(dump, null, 2));
  console.log(`URL: ${dump.url}`);
  console.log(`HEADINGS: ${JSON.stringify(dump.headings.map((h: any) => h.text))}`);
  console.log(`WIDGETS (${dump.widgets.length}):`);
  for (const w of dump.widgets) {
    console.log(
      `  [${w.widgetClass}] id=${w.id} label=${JSON.stringify(w.label)} visible=${w.visible}` +
        (w.innerSelect ? ` select(name=${w.innerSelect.name}, multiple=${w.innerSelect.multiple}, options=${JSON.stringify(w.innerSelect.options.map((o: any) => o.text))})` : '')
    );
  }
  const visibleControls = dump.controls.filter((c: any) => c.visible && !c.hiddenInput);
  console.log(`VISIBLE CONTROLS (${visibleControls.length} of ${dump.controls.length} total incl. hidden):`);
  for (const c of visibleControls) {
    console.log(
      `  <${c.tag}${c.type ? ' type=' + c.type : ''}> id=${c.id} name=${c.name} label=${JSON.stringify(c.label)}` +
        (c.text ? ` text=${JSON.stringify(c.text)}` : '') +
        (c.options ? ` options=${JSON.stringify(c.options.map((o: any) => o.text))}` : '') +
        (c.widgetClass ? ` widget=[${c.widgetClass}]` : '')
    );
  }
  console.log('WROTE ' + OUT_FILE);
});
