/**
 * ONE-OFF DISCOVERY SPEC — not a regression test.
 * Logs in, opens the main Menu, finds every top-level menu group, clicks each,
 * and dumps the full submenu structure (column/ul/li positions, link text,
 * title, href) as JSON so navigation helpers can be generated for every item.
 * Groups that open a modal dialog instead of submenu columns are recorded as such.
 *
 * Output: console + menu-map.json in the harness root (written incrementally).
 * Delete this file once helpers.ts and the skill guide are updated.
 */
import { test } from '@playwright/test';
import { loginAsSuper } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

test.setTimeout(540_000);

// Material icon glyph names that show up as icon-button "text" — not menu groups.
const ICON_GLYPHS = new Set([
  'filter_list', 'remove_red_eye', 'autorenew', 'edit', 'add_box', 'replay',
  'keyboard_arrow_up', 'keyboard_arrow_down', 'more_vert', 'close', 'search',
]);

const OUT_FILE = path.join(__dirname, '..', 'menu-map.json');

test('discover all menu groups and items', async ({ page }) => {
  test.skip(!process.env.MENU_DISCOVERY, 'Maintenance tool — run with MENU_DISCOVERY=1 to re-derive menu-map.json / MENU_MAP');
  await loginAsSuper(page);
  await page.waitForTimeout(3000);

  const menuButton = page.getByRole('button', { name: 'menu Menu' });

  // Open the menu once to enumerate top-level group buttons.
  await menuButton.click();
  await page.waitForTimeout(1000);
  const groupNames: string[] = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push((b.textContent || '').trim());
    });
    return out;
  });
  const groups = [...new Set(groupNames)].filter(
    (t) => t && t !== 'Menu' && !ICON_GLYPHS.has(t) && !/^[a-z_0-9]+$/.test(t)
  );
  console.log('TOP-LEVEL GROUPS: ' + JSON.stringify(groups));

  const result: any = { groups, menus: {}, modals: {} };
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));

  for (const group of groups) {
    // Fresh page state each iteration: clears open menus AND stray modals.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    try {
      await menuButton.click({ timeout: 15000 });
      await page.waitForTimeout(800);
      const groupButton = page.getByRole('button', { name: group, exact: true }).first();
      await groupButton.click({ timeout: 10000 });
      await page.waitForTimeout(1200);
    } catch (e) {
      result.menus[group] = { error: String(e).split('\n')[0] };
      fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
      console.log(`GROUP "${group}": CLICK FAILED — ${String(e).split('\n')[0]}`);
      continue;
    }

    // Did the click open a modal dialog instead of menu columns?
    const modalInfo = await page.evaluate(() => {
      const modal = document.querySelector('.eto-modal.open');
      if (!modal) return null;
      const heading = modal.querySelector('h1,h2,h3,h4,[class*="title"]');
      return {
        heading: heading?.textContent?.trim() ?? null,
        text: (modal.textContent || '').trim().slice(0, 600),
      };
    });

    const columns = await page.evaluate(() => {
      const cols: any[] = [];
      document.querySelectorAll('.eto-header__menu-column').forEach((col, ci) => {
        const rect = col.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const uls: any[] = [];
        col.querySelectorAll(':scope > ul').forEach((ul, ui) => {
          const groupsOut: any[] = [];
          ul.querySelectorAll(':scope > li').forEach((li) => {
            const headingEl = li.querySelector(':scope > :not(ul):not(.eto-menu__group)');
            const links: any[] = [];
            li.querySelectorAll(':scope > .eto-menu__group > li').forEach((item, ii) => {
              const a = item.querySelector('.eto-menu__link');
              links.push({
                position: ii + 1,
                text: (a?.textContent || item.textContent || '').trim(),
                title: a?.getAttribute('title') ?? null,
                href: a?.getAttribute('href') ?? null,
              });
            });
            groupsOut.push({ heading: headingEl?.textContent?.trim() ?? null, links });
          });
          uls.push({ ulIndex: ui + 1, groups: groupsOut });
        });
        cols.push({ columnIndex: ci + 1, uls });
      });
      return cols;
    });

    result.menus[group] = columns;
    if (modalInfo) result.modals[group] = modalInfo;
    fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
    console.log(`GROUP "${group}": columns=${columns.length}${modalInfo ? ' +MODAL: ' + modalInfo.heading : ''}`);
  }

  console.log('WROTE ' + OUT_FILE);
});
